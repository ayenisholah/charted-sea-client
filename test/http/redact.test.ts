import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "../../src/http/redact.js";

describe("redact", () => {
  it("NFR-1: replaces every occurrence of a secret", () => {
    expect(redact("token cs_live_abc and again cs_live_abc", ["cs_live_abc"])).toBe(
      `token ${REDACTED} and again ${REDACTED}`,
    );
  });

  it("NFR-1: replaces the URL-encoded form of a secret", () => {
    expect(redact("q=a%2Fb%3D", ["a/b="])).toBe(`q=${REDACTED}`);
  });

  it("ignores empty secrets", () => {
    expect(redact("unchanged", [""])).toBe("unchanged");
  });

  it("NFR-1: redacts bearer credentials whatever the secret list", () => {
    expect(redact("Authorization: Bearer abc.def-123")).toBe(`Authorization: Bearer ${REDACTED}`);
    expect(redact("authorization: bearer xyz")).toBe(`authorization: bearer ${REDACTED}`);
  });

  it("NFR-1: redacts userinfo in proxy URLs from the API reference", () => {
    const urls = [
      "socks5://uuu__cr.${country(case=LOWER)}:ppp@gw.dataimpulse.com:${rand(range=[10000,19999])}",
      "http://john.doe%40example.com%3Fcountry%3D${country(case=UPPER)}%26session%3D${rand(len=10,use=[lowerCaseChar,upperCaseChar,digit])}:ppp@network.joinmassive.com:65534",
      "http://uuu:ppp_country-${country(case=LOWER)}_ttl-30m_session-${rand(len=12,use=[lowerCaseChar,upperCaseChar,digit])}@superproxy.zenrows.com:1337",
    ];
    for (const url of urls) {
      const out = redact(`proxy ${url} failed`);
      expect(out).toMatch(new RegExp(`^proxy [a-z0-9]+://${REDACTED.replace(/\*/g, "\\*")}@`));
      expect(out).not.toContain("ppp");
      expect(out).not.toContain("uuu");
    }
  });

  it("leaves URLs without userinfo alone", () => {
    const text =
      "GET https://continuous-scraper.common.chartedapi.com/scraping-tasks/shopee?uuids=a@b";
    expect(redact(text)).toBe(text);
  });

  it("NFR-1: redacts userinfo even when the scheme follows a digit or symbol", () => {
    expect(redact("see 1http://user:pass@h")).toBe(`see 1http://${REDACTED}@h`);
    expect(redact("(socks5://u:p@h)")).toBe(`(socks5://${REDACTED}@h)`);
  });

  it("redacts several URLs in one string", () => {
    expect(redact("a http://u:p@h1 b socks5://x:y@h2")).toBe(
      `a http://${REDACTED}@h1 b socks5://${REDACTED}@h2`,
    );
  });

  it("NFR-1 property: a secret never survives, wherever it is embedded", () => {
    const secret = fc.string({ minLength: 8, maxLength: 40 }).filter((s) => s.trim().length >= 8);
    fc.assert(
      fc.property(fc.string(), secret, fc.string(), (before, s, after) => {
        expect(redact(before + s + after, [s])).not.toContain(s);
      }),
    );
  });

  it("property: text without secrets, bearer or URLs is unchanged", () => {
    const plain = fc.stringMatching(/^[a-zA-Z0-9 .,_-]*$/).filter((s) => !/bearer/i.test(s));
    fc.assert(fc.property(plain, (s) => redact(s, ["sentinel-secret-value"]) === s));
  });
});
