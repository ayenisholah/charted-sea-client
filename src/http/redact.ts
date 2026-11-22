/** Replacement text for anything redacted. */
export const REDACTED = "***";

const BEARER = /\b(bearer)\s+[^\s"',;]+/gi;
// scheme://userinfo@ — userinfo may contain placeholders and %-escapes but never "/", "@" or spaces.
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

function replaceAll(text: string, needle: string): string {
  return text.split(needle).join(REDACTED);
}

function pass(text: string, needles: readonly string[]): string {
  let out = text;
  for (const needle of needles) out = replaceAll(out, needle);
  return out
    .replace(BEARER, (_m, word: string) => `${word} ${REDACTED}`)
    .replace(URL_USERINFO, (_m, scheme: string) => `${scheme}${REDACTED}@`);
}

/**
 * Removes secrets from text before it reaches an error, a log or `cause`.
 *
 * Redacts each given secret (and its URL-encoded form), any `Bearer` credential,
 * and the userinfo part of URLs such as `socks5://user:pass@host` (proxy credentials).
 *
 * @example
 * redact("socks5://user:pass@gw.example.com:1000"); // "socks5://***@gw.example.com:1000"
 */
export function redact(text: string, secrets: readonly string[] = []): string {
  const needles = [...new Set(secrets.flatMap((s) => [s, encodeURIComponent(s)]))]
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);
  // Repeat until stable: every pass only shortens matches, so this terminates,
  // and a secret can't reappear by joining the text around a replacement.
  let current = text;
  for (;;) {
    const next = pass(current, needles);
    if (next === current) return next;
    current = next;
  }
}
