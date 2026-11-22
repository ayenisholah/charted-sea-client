import { describe, expect, it } from "vitest";
import {
  decodeAs,
  decodeCancel,
  decodeCounts,
  decodeProxyConfigs,
  decodeProxyValidations,
  decodeSessionMetrics,
  decodeTask,
  decodeTasks,
} from "../src/decode.js";
import { ResponseError } from "../src/errors.js";

describe("decoders", () => {
  it("NFR-7: keep unknown fields and normalise a missing body to null", () => {
    expect(decodeTask({ url: "u", status: "NEW_STATUS", extra: 1 })).toEqual({
      url: "u",
      status: "NEW_STATUS",
      extra: 1,
      responseBody: null,
    });
    expect(decodeTasks([{ url: "u", status: "SUCCESS", responseBody: "b" }])[0]?.responseBody).toBe(
      "b",
    );
  });

  it("decode counts and cancel results", () => {
    expect(decodeCounts([{ country: "ID", status: "SUCCESS", count: 1 }])).toEqual([
      { country: "ID", status: "SUCCESS", count: 1 },
    ]);
    expect(decodeCancel({})).toEqual({ uuids: [], countries: [] });
  });

  it.each([
    ["task not an object", decodeTask, []],
    ["missing url", decodeTask, { status: "SUCCESS" }],
    ["body not a string", decodeTask, { url: "u", status: "SUCCESS", responseBody: 1 }],
    ["tasks not an array", decodeTasks, {}],
    ["count not a number", decodeCounts, [{ country: "ID", status: "S", count: "1" }]],
    ["uuid not a string", decodeCancel, { uuids: [1] }],
  ])("reject a wrong shape (%s) as ResponseError", (_label, decoder, raw) => {
    expect(() => decodeAs(decoder as (r: unknown) => unknown, "GET /x")(raw)).toThrow(
      ResponseError,
    );
  });

  it("NFR-7: health and proxy decoders default omitted optional lists", () => {
    const report = decodeSessionMetrics({
      startAtIncl: "a",
      endAtExcl: "b",
      granularity: "TOTAL",
      periods: [],
    });
    expect([report.scrapers, report.countries]).toEqual([[], []]);
    expect(decodeProxyValidations([{ url: "u" }])).toEqual([
      { url: "u", tests: [], compatibilities: [] },
    ]);
    expect(
      decodeProxyValidations([
        { url: "u", compatibilities: [{ scraper: "S", compatible: true }] },
      ])[0]?.compatibilities[0]?.description,
    ).toBe("");
  });

  it.each([
    [
      "test.success not a boolean",
      decodeProxyValidations,
      [{ url: "u", tests: [{ type: "http", success: "yes" }] }],
    ],
    [
      "metric without scraper",
      decodeSessionMetrics,
      {
        startAtIncl: "a",
        endAtExcl: "b",
        granularity: "T",
        periods: [{ startAtIncl: "a", endAtExcl: "b", metrics: [{ country: "SG" }] }],
      },
    ],
    [
      "setting urls not strings",
      decodeProxyConfigs,
      [{ scraper: "S", proxySettings: [{ type: "R", urls: [1] }] }],
    ],
  ])("reject %s", (_label, decoder, raw) => {
    expect(() => decodeAs(decoder as (r: unknown) => unknown, "GET /x")(raw)).toThrow(
      ResponseError,
    );
  });

  it("rethrows errors that aren't shape errors", () => {
    const boom = new TypeError("boom");
    expect(() =>
      decodeAs(() => {
        throw boom;
      }, "GET /x")(null),
    ).toThrow(boom);
  });
});
