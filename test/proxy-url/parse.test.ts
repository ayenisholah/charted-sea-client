import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkProxyUrl } from "../../src/proxy-url/parse.js";

/** Every proxy URL in the API reference (snapshot 2026-11-22). */
const DOC_URLS = [
  "socks5://uuu__cr.${country(case=LOWER)}:ppp@gw.dataimpulse.com:${rand(range=[10000,19999])}",
  "socks5://uuu-zone-custom-region-${country(case=LOWER)}-session-${rand(len=9,use=[lowerCaseChar,digit])}-sessTime-10:ppp@p1.mangoproxy.com:2333",
  "socks5://uuu:ppp_country-${country(case=LOWER)}_session-${rand(len=8,use=[lowerCaseChar,upperCaseChar,digit])}_lifetime-15m@geo.iproyal.com:12321",
  "http://uuu-residential-country_${country(case=UPPER)}-r_10m-s_${rand(len=10,use=[lowerCaseChar,upperCaseChar,digit])}:ppp@gate.nstproxy.io:24125",
  "socks5://uuu:ppp_country-${country(case=UPPER)}_http3-1_session-${rand(len=9,use=[upperCaseChar,digit])}_lifetime-20@udp.evomi.com:1002",
  "socks5://uuu-country-${country(case=UPPER)}-refreshMinutes-30-udp-true:ppp@premium.residential.proxyrack.net:${rand(range=[10000,15000])}",
  "http://user-uuu-region-${country(case=LOWER)}-sessid-${country(case=LOWER)}${rand(len=16,use=[lowerCaseChar,digit])}-sesstime-30:ppp@as.e4f4xh3i.lunaproxy.net:12233",
  "http://uuu:ppp_country-${country(case=LOWER)}_session-${rand(len=8,use=[lowerCaseChar,upperCaseChar,digit])}_lifetime-30m@geo.iproyal.com:12321",
  "http://brd-customer-hl_uuu-zone-zzz-country-${country(case=LOWER)}-session-${rand(range=[1,70000000])}:ppp@brd.superproxy.io:22225",
  "http://customer-uuu-cc-${country(case=UPPER)}-sessid-${rand(len=10,use=[lowerCaseChar,digit])}-sesstime-30:ppp@pr.oxylabs.io:7777",
  "http://john.doe%40example.com%3Fcountry%3D${country(case=UPPER)}%26session%3D${rand(len=10,use=[lowerCaseChar,upperCaseChar,digit])}:ppp@network.joinmassive.com:65534",
  "http://uuu-zone-custom-region-${country(case=LOWER)}-session-${rand(len=9,use=[lowerCaseChar,digit])}-sessTime-30:ppp@p1.mangoproxy.com:2333",
  "http://uuu-res-${country(case=UPPER)}-sid-${rand(len=9,use=[digit])}:ppp@gw.ntnt.io:5959",
  "http://uuu:ppp_country-${country(case=LOWER)}_ttl-30m_session-${rand(len=12,use=[lowerCaseChar,upperCaseChar,digit])}@superproxy.zenrows.com:1337",
  "http://package-123456-country-${country(case=LOWER)}-sessionid-${rand(len=10,use=[lowerCaseChar,digit])}-sessionlength-30:ppp@proxy.soax.com:5000",
  "http://uuu-zone-custom-region-${country(case=UPPER)}-session-${rand(len=8,use=[digit])}-sessTime-30-sessAuto-1:ppp@global.711proxy.com:10000",
];

describe("checkProxyUrl", () => {
  it.each(DOC_URLS)("FR-8: accepts the documented URL %s", (url) => {
    const result = checkProxyUrl(url);
    expect(result).toMatchObject({ ok: true });
  });

  it("FR-8: returns each placeholder with its arguments and offsets", () => {
    const url = DOC_URLS[0] ?? "";
    const result = checkProxyUrl(url);
    if (!result.ok) throw new Error(result.reason);
    expect(result.scheme).toBe("socks5");
    expect(result.placeholders.map((p) => [p.name, p.args, url.slice(p.start, p.end)])).toEqual([
      ["country", { case: "LOWER" }, "${country(case=LOWER)}"],
      ["rand", { range: [10000, 19999] }, "${rand(range=[10000,19999])}"],
    ]);
  });

  it("accepts the documented rand forms, quoted subsets with escapes, spaces and no placeholders", () => {
    for (const url of [
      'http://u-${rand(len=12,subset="abcdef012345")}:p@h:1',
      'http://u-${rand(len=4,subset="a\\$b\\"c\\\\d")}:p@h:1',
      "http://u-${rand( len=8 , use=[ lowerCaseChar , digit ] )}:p@h:1",
      "http://u-${country()}:p@h:1",
      "https://plain.example:8080",
      "socks5h://u$1:p@h:1",
    ]) {
      expect(checkProxyUrl(url), url).toMatchObject({ ok: true });
    }
    const quoted = checkProxyUrl('http://${rand(len=4,subset="a\\$b")}');
    expect(quoted.ok && quoted.placeholders[0]?.args["subset"]).toEqual({ quoted: "a$b" });
  });

  it.each([
    ["gw.example.com:1000", 0, /scheme/],
    ["ftp://h", 0, /unsupported scheme ftp/],
    ["http://${randy(len=1)}", 9, /unknown placeholder/],
    ["http://${rand len=1}", 13, /expected '\('/],
    ["http://${rand(len=1)", 20, /expected '}'/],
    ["http://${rand(len=1", 19, /',' or '\)'/],
    ["http://${rand(=1)}", 14, /argument name/],
    ["http://${rand(len)}", 17, /expected '='/],
    ["http://${rand(len=1,len=2)}", 20, /duplicate argument len/],
    ["http://${rand(len=?)}", 18, /number or a name/],
    ["http://${rand(use=[])}", 19, /empty list/],
    ["http://${rand(use=[digit;x])}", 24, /',' or '\]'/],
    ['http://${rand(subset="ab)}', 21, /unterminated string/],
    ['http://${rand(subset="a\\nb")}', 23, /valid escapes/],
    ['http://${rand(subset="a\\', 23, /valid escapes/],
    ['http://${rand(len=2,subset="a$b")}', 29, /must be escaped/],
    ["http://${rand(len=0)}", 7, /len must be a positive integer/],
    ["http://${rand(use=[digit])}", 7, /len must be/],
    ["http://${rand(size=3)}", 7, /rand doesn't take size/],
    ["http://${rand(range=[1,2],len=3)}", 7, /can't be combined/],
    ["http://${rand(range=[5,1])}", 7, /min ≤ max/],
    ["http://${rand(range=[1,2,3])}", 7, /min ≤ max/],
    ["http://${rand(range=5)}", 7, /min ≤ max/],
    ['http://${rand(len=3,use=[digit],subset="a")}', 7, /alternatives/],
    ["http://${rand(len=3,use=[emoji])}", 7, /use must list/],
    ["http://${rand(len=3,use=digit)}", 7, /use must list/],
    ['http://${rand(len=3,subset="")}', 7, /non-empty quoted/],
    ["http://${rand(len=3,subset=abc)}", 7, /non-empty quoted/],
    ["http://${country(case=lower)}", 7, /UPPER or LOWER/],
    ["http://${country(cas=UPPER)}", 7, /country doesn't take cas/],
  ])("FR-8: reports %s at offset %i", (url, offset, reason) => {
    const result = checkProxyUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.offset).toBe(offset);
      expect(result.reason).toMatch(reason);
    }
  });

  it("FR-8 property: generated valid templates are accepted with every placeholder found", () => {
    const sets = fc.subarray(["lowerCaseChar", "upperCaseChar", "digit", "symbol"], {
      minLength: 1,
    });
    const rand = fc.oneof(
      fc
        .tuple(fc.integer({ min: 1, max: 64 }), sets)
        .map(([len, use]) => `\${rand(len=${String(len)},use=[${use.join(",")}])}`),
      fc
        .tuple(fc.nat(1000), fc.nat(1000))
        .map(([a, b]) => `\${rand(range=[${String(Math.min(a, b))},${String(Math.max(a, b))}])}`),
    );
    const placeholder = fc.oneof(
      rand,
      fc.constantFrom("${country(case=UPPER)}", "${country(case=LOWER)}"),
    );
    const literal = fc.stringMatching(/^[a-zA-Z0-9_.:@%-]*$/);
    fc.assert(
      fc.property(fc.array(fc.tuple(literal, placeholder), { maxLength: 5 }), (parts) => {
        const url = `socks5://${parts.map(([l, p]) => l + p).join("")}`;
        const result = checkProxyUrl(url);
        expect(result.ok && result.placeholders.length).toBe(parts.length);
      }),
    );
  });

  it("property: mutating a character inside ${…} is accepted or reported inside the template", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DOC_URLS),
        fc.nat(),
        fc.string({ minLength: 1, maxLength: 1 }),
        (url, n, ch) => {
          const starts = [...url.matchAll(/\$\{/g)].map((m) => m.index);
          const at = (starts[n % starts.length] ?? 0) + 2 + (n % 6);
          const mutated = url.slice(0, at) + ch + url.slice(at + 1);
          const result = checkProxyUrl(mutated);
          if (!result.ok) {
            expect(result.offset).toBeGreaterThanOrEqual(0);
            expect(result.offset).toBeLessThanOrEqual(mutated.length);
          }
        },
      ),
    );
  });
});
