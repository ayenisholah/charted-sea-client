/** A value inside a placeholder: a number, an identifier, a quoted string or a list. */
export type PlaceholderValue = number | string | { quoted: string } | (number | string)[];

export interface Placeholder {
  name: "rand" | "country";
  args: Record<string, PlaceholderValue>;
  /** Offsets of `${` and just after `}` in the template. */
  start: number;
  end: number;
}

export type ProxyUrlCheck =
  | { ok: true; scheme: string; placeholders: Placeholder[] }
  | { ok: false; offset: number; reason: string };

const SCHEMES: ReadonlySet<string> = new Set(["http", "https", "socks4", "socks5", "socks5h"]);
const CHAR_SETS: ReadonlySet<string> = new Set([
  "lowerCaseChar",
  "upperCaseChar",
  "digit",
  "symbol",
]);
const ESCAPABLE: ReadonlySet<string> = new Set(["$", '"', "\\"]);

class ParseError extends Error {
  constructor(
    readonly offset: number,
    reason: string,
  ) {
    super(reason);
  }
}

class Cursor {
  pos: number;
  constructor(
    readonly text: string,
    start: number,
  ) {
    this.pos = start;
  }
  peek(): string | undefined {
    return this.text[this.pos];
  }
  skipSpaces(): void {
    while (this.peek() === " ") this.pos++;
  }
  expect(ch: string, what: string): void {
    if (this.peek() !== ch) throw new ParseError(this.pos, `expected ${what}`);
    this.pos++;
  }
  match(re: RegExp): string | undefined {
    const m = re.exec(this.text.slice(this.pos));
    if (!m) return undefined;
    this.pos += m[0].length;
    return m[0];
  }
}

function parseQuoted(c: Cursor): { quoted: string } {
  const start = c.pos;
  c.expect('"', "a quote");
  let out = "";
  for (;;) {
    const ch = c.peek();
    if (ch === undefined) throw new ParseError(start, "unterminated string");
    c.pos++;
    if (ch === '"') return { quoted: out };
    if (ch === "\\") {
      const next = c.peek();
      if (next === undefined || !ESCAPABLE.has(next)) {
        throw new ParseError(c.pos - 1, 'only \\$, \\" and \\\\ are valid escapes');
      }
      out += next;
      c.pos++;
    } else if (ch === "$") {
      throw new ParseError(c.pos - 1, "$ must be escaped as \\$ inside a string");
    } else {
      out += ch;
    }
  }
}

function parseAtom(c: Cursor): number | string {
  const num = c.match(/^-?\d+/);
  if (num !== undefined) return Number(num);
  const ident = c.match(/^[A-Za-z]+/);
  if (ident !== undefined) return ident;
  throw new ParseError(c.pos, "expected a number or a name");
}

function parseValue(c: Cursor): PlaceholderValue {
  const ch = c.peek();
  if (ch === '"') return parseQuoted(c);
  if (ch !== "[") return parseAtom(c);
  c.pos++;
  const items: (number | string)[] = [];
  c.skipSpaces();
  if (c.peek() === "]") throw new ParseError(c.pos, "empty list");
  for (;;) {
    c.skipSpaces();
    items.push(parseAtom(c));
    c.skipSpaces();
    if (c.peek() === "]") {
      c.pos++;
      return items;
    }
    c.expect(",", "',' or ']'");
  }
}

function positiveInt(v: PlaceholderValue | undefined, offset: number, what: string): void {
  if (typeof v !== "number" || v < 1)
    throw new ParseError(offset, `${what} must be a positive integer`);
}

function validateRand(args: Record<string, PlaceholderValue>, offset: number): void {
  for (const key of Object.keys(args)) {
    if (!["len", "use", "subset", "range"].includes(key)) {
      throw new ParseError(offset, `rand doesn't take ${key}`);
    }
  }
  const { len, use, subset, range } = args;
  if (range !== undefined) {
    if (len !== undefined || use !== undefined || subset !== undefined) {
      throw new ParseError(offset, "range can't be combined with len, use or subset");
    }
    const [min, max, ...rest] = Array.isArray(range) ? range : [];
    if (typeof min !== "number" || typeof max !== "number" || rest.length > 0 || min > max) {
      throw new ParseError(offset, "range must be [min,max] with min ≤ max");
    }
    return;
  }
  positiveInt(len, offset, "len");
  if (use !== undefined && subset !== undefined) {
    throw new ParseError(offset, "use and subset are alternatives; pass one");
  }
  if (use !== undefined && !(Array.isArray(use) && use.every((u) => CHAR_SETS.has(String(u))))) {
    throw new ParseError(offset, "use must list lowerCaseChar, upperCaseChar, digit or symbol");
  }
  if (
    subset !== undefined &&
    !(typeof subset === "object" && "quoted" in subset && subset.quoted !== "")
  ) {
    throw new ParseError(offset, "subset must be a non-empty quoted string");
  }
}

function validateCountry(args: Record<string, PlaceholderValue>, offset: number): void {
  for (const [key, value] of Object.entries(args)) {
    if (key !== "case") throw new ParseError(offset, `country doesn't take ${key}`);
    if (value !== "UPPER" && value !== "LOWER")
      throw new ParseError(offset, "case must be UPPER or LOWER");
  }
}

function parsePlaceholder(text: string, start: number): Placeholder {
  const c = new Cursor(text, start + 2);
  const nameAt = c.pos;
  const name = c.match(/^[a-z]+/);
  if (name !== "rand" && name !== "country") {
    throw new ParseError(nameAt, "unknown placeholder; expected rand(...) or country(...)");
  }
  c.expect("(", "'('");
  const args: Record<string, PlaceholderValue> = {};
  c.skipSpaces();
  if (c.peek() !== ")") {
    for (;;) {
      c.skipSpaces();
      const keyAt = c.pos;
      const key = c.match(/^[a-z][A-Za-z]*/);
      if (key === undefined) throw new ParseError(keyAt, "expected an argument name");
      if (key in args) throw new ParseError(keyAt, `duplicate argument ${key}`);
      c.expect("=", "'='");
      args[key] = parseValue(c);
      c.skipSpaces();
      if (c.peek() === ")") break;
      c.expect(",", "',' or ')'");
    }
  }
  c.pos++;
  c.expect("}", "'}'");
  if (name === "rand") validateRand(args, start);
  else validateCountry(args, start);
  return { name, args, start, end: c.pos };
}

/**
 * Checks a proxy URL template locally before any network call (FR-8): the scheme, and the syntax
 * of `${rand(...)}` and `${country(...)}` placeholders. It doesn't test the proxy itself; use
 * `proxies.validate` for that.
 */
export function checkProxyUrl(template: string): ProxyUrlCheck {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(template)?.[1];
  if (scheme === undefined)
    return { ok: false, offset: 0, reason: "expected scheme://, e.g. socks5://" };
  if (!SCHEMES.has(scheme)) {
    return {
      ok: false,
      offset: 0,
      reason: `unsupported scheme ${scheme}; use http, https, socks4, socks5 or socks5h`,
    };
  }
  const placeholders: Placeholder[] = [];
  try {
    for (let i = template.indexOf("${"); i !== -1; i = template.indexOf("${", i)) {
      const p = parsePlaceholder(template, i);
      placeholders.push(p);
      i = p.end;
    }
  } catch (error) {
    // Only ParseError is thrown above.
    const { offset, message } = error as ParseError;
    return { ok: false, offset, reason: message };
  }
  return { ok: true, scheme, placeholders };
}
