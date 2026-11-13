/** A rebuild's held mark is told from an ordinary withheld one by its code, whatever its prose. */
import { describe, expect, it } from "vitest";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import { evidenceHeldProjectionMark, isEvidenceHeldEntry, withheldProjectionMark } from "../../../../src/lib/store/projection/materialization-file.js";

type Entry = ProjectionIndex["entries"][string];
const ownerless = (reason: string): Entry => ({ kind: "ownerless", withheld: true, stat: null,
  refused: { reason, remedy: { text: "Any remedy." } } });

describe("isEvidenceHeldEntry", () => {
  it("keys a held entry on its code, so reworded prose stays held", () => {
    expect(isEvidenceHeldEntry(ownerless(evidenceHeldProjectionMark().reason))).toBe(true);
    expect(isEvidenceHeldEntry(ownerless("evidence-held: Worded some other way."))).toBe(true);
  });

  it("never reads an ordinary withheld entry, or one no longer withheld, as held", () => {
    expect(isEvidenceHeldEntry(ownerless(withheldProjectionMark().reason))).toBe(false);
    expect(isEvidenceHeldEntry({ kind: "ownerless", stat: null, refused: evidenceHeldProjectionMark() })).toBe(false);
  });
});
