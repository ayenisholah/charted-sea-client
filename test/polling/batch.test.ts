import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { chunk, orderBy, unique } from "../../src/polling/batch.js";

describe("batch", () => {
  it("FR-5 property: chunks cover the input exactly once, each within size", () => {
    fc.assert(
      fc.property(fc.array(fc.uuid()), fc.integer({ min: 1, max: 150 }), (items, size) => {
        const chunks = chunk(items, size);
        expect(chunks.flat()).toEqual(items);
        expect(chunks.every((c) => c.length > 0 && c.length <= size)).toBe(true);
      }),
    );
  });

  it("FR-3 property: orderBy restores input order from any permutation", () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.uuid())
          .chain((keys) => fc.tuple(fc.constant(keys), fc.shuffledSubarray(keys))),
        ([keys, found]) => {
          const { ordered, missing } = orderBy(
            keys,
            found.map((uuid) => ({ uuid })),
            (t) => t.uuid,
          );
          expect(ordered.map((t) => t.uuid)).toEqual(keys.filter((k) => found.includes(k)));
          expect(missing).toEqual(keys.filter((k) => !found.includes(k)));
        },
      ),
    );
  });

  it("ignores items without a key or with a duplicate key", () => {
    const { ordered } = orderBy(
      ["a"],
      [{ k: undefined }, { k: "a", n: 1 }, { k: "a", n: 2 }],
      (t) => t.k,
    );
    expect(ordered).toEqual([{ k: "a", n: 1 }]);
    expect(unique(["a", "b", "a"])).toEqual(["a", "b"]);
  });
});
