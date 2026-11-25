/** Production Purpose decoding for the three design kinds, leaving notes raw. */
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../../../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);

describe("design registrations", () => {
  for (const kind of ["work-item/draft", "work-item/spec", "work-item/companion"] as const) {
    it.each([
      ["full Purpose", "**Purpose:** A first sentence. A second sentence.", "A first sentence. A second sentence."],
      ["absent Purpose", "# Brief design\n\nDescription.", null],
    ])(`${kind} decodes %s without refusing`, (_name, content, purpose) => {
      expect(registry[kind].parser?.(content)).toEqual({ success: true, data: { purpose } });
    });
  }

  it("leaves notes without a parser", () => {
    expect(registry["work-item/notes"].parser).toBeNull();
  });
});
