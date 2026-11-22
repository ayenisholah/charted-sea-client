import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import type { ProxyConfig } from "../../src/types.js";
import { testClient } from "../support/client.js";
import { fixture } from "../support/fixtures.js";
import { recorded, serveFixture, useMockApi } from "../support/mock-api.js";

useMockApi();

describe("proxies contract (API reference examples)", () => {
  it("FR-1: validate posts the URL array and returns tests and compatibilities", async () => {
    serveFixture("proxy-validate");
    const { client } = testClient();
    const [first, second] = await client.proxies.validate(
      fixture("proxy-validate").request.body as string[],
    );
    expect(first?.tests.find((t) => t.type === "tcp20443")).toMatchObject({
      success: false,
      errors: ["Error: read ECONNRESET"],
    });
    expect(second?.compatibilities[0]).toMatchObject({
      scraper: "SHOPEE",
      compatible: false,
      incompatibilityReason: "Unsupported protocol/port(s): HTTP3/443",
    });
  });

  it("FR-1: read and update round-trip the documented configuration", async () => {
    serveFixture("proxy-configs-read");
    serveFixture("proxy-configs-update");
    const { client } = testClient();
    const configs = await client.proxies.read();
    expect(configs.map((c) => c.scraper)).toEqual(["SHOPEE", "SHOPEE_ANDROID", "LAZADA"]);
    await expect(client.proxies.update(configs)).resolves.toEqual(
      fixture("proxy-configs-update").response.body,
    );
  });

  it("an update with an invalid URL throws ValidationError with invalidUrls in details, once", async () => {
    serveFixture("proxy-configs-update-invalid");
    const { client } = testClient();
    const error = await client.proxies
      .update(fixture("proxy-configs-update-invalid").request.body as ProxyConfig[])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual(
      fixture("proxy-configs-update-invalid").response.body,
    );
    expect(recorded).toHaveLength(1);
  });

  it("NFR-1: proxy credentials in an error body are redacted", async () => {
    const { client } = testClient({
      fetch: async () =>
        new Response(
          JSON.stringify([
            { invalidUrls: [{ url: "socks5://user:secret@gw.example:1", reason: "HAS_ERROR" }] },
          ]),
          { status: 400 },
        ),
    });
    const error = (await client.proxies.update([]).catch((e: unknown) => e)) as ValidationError;
    expect(JSON.stringify(error.details)).toContain("socks5://***@gw.example:1");
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  it("rejects an empty validate call locally", async () => {
    const { client } = testClient();
    await expect(client.proxies.validate([])).rejects.toBeInstanceOf(ValidationError);
  });
});
