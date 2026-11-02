/** The projection index's strict schema and its JSON form. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import {
  OwnerIdentitySchema, RecordVersionSchema, StateVersionSchema, recordReferences,
} from "../../../../src/lib/store/identity.js";
import {
  decodeProjectionIndex, encodeProjectionIndex, type ProjectionIndex,
} from "../../../../src/lib/store/projection/index-schema.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "alpha", uid: "0190f3a2-7c41-7b1e-9d3c-5a2b8e4f6c10" });
const meta = recordReferences["work-item/meta"](owner);
const conflict = recordReferences["work-item/conflict-record"](owner, "c1");
const blob = (digit: string) => digit.repeat(40);
const stat = { type: "file" as const, size: 9_007_199_254_740_993n, mtimeNs: 1_761_234_567_890_123_456n, ino: 18_446_744_073_709_551_615n };
const remedy = { text: "Repair the entry, then run the command again." };

function fullIndex(): ProjectionIndex {
  return {
    format: 1,
    state: StateVersionSchema.parse("state-7"),
    projectedUnder: {
      view: { mode: "cohort", pins: [SlugSchema.parse("beta")] }, identity: SlugSchema.parse("andrew"),
      claim: SlugSchema.parse("alpha"), layoutActive: "nested",
    },
    withheldCopies: ["active/current/meta-alpha.md/0000.1-1-ab.n.aside"],
    tripwires: { refresh: [1.5, 2, 3, 4, 5, 6, 7, 8, 9] },
    ignoreGuard: { roots: ["/repo/.arc/user/andrew/"], configuration: {
      path: "/repo/ignore", values: ["~/prior-ignore", "/repo/ignore"], ignoreCase: ["true", null],
    } },
    ignoreFiles: [
      { path: "/repo/.git/info/exclude", stat, blob: blob("a") },
      { path: "/repo/.arc/.gitignore", stat: null, blob: null },
    ],
    entries: {
      ".arc/active/current/meta-alpha.md": {
        kind: "record", reference: meta, stat, written: blob("b"),
        base: { blob: blob("c"), version: RecordVersionSchema.parse("v3") },
        markers: { length: 7, sets: [{ shows: "stored", conflict }, { shows: "checkout" }] },
        notices: [conflict], unshown: [conflict], protected: true, changed: true, pending: true, withheld: false,
        refused: { reason: "write-check", remedy },
        persisted: { stamp: blob("d"), takenIn: { kind: "copy", version: RecordVersionSchema.parse("v3"), name: "taken-in-1", blob: blob("e") } },
        inProgress: { replaces: { blob: blob("f"), version: RecordVersionSchema.parse("v2") }, copy: "copy-1" },
        copies: [
          { name: "copy-1", moving: blob("1"), linked: blob("2"), writeBackSent: true, landed: blob("3") },
          { name: "copy-2", moving: blob("4"), linked: null, writeBackSent: false, landed: null },
        ],
      },
      ".arc/active/current/tasks-alpha.md": {
        kind: "record", reference: recordReferences["work-item/record"](owner), stat: null, written: blob("5"),
        base: { blob: blob("6"), version: RecordVersionSchema.parse("v1") }, markers: null, notices: [], unshown: [],
        protected: false, changed: false, pending: false, withheld: true, refused: null,
        persisted: { stamp: blob("7"), takenIn: { kind: "landed", version: RecordVersionSchema.parse("v4") } },
        inProgress: { replaces: { blob: blob("8"), version: RecordVersionSchema.parse("v0") }, copy: null }, copies: [],
      },
      ".arc/backlog/planned/stray.md": { kind: "ownerless", stat, refused: { reason: "unadoptable", remedy } },
    },
  };
}

describe("the projection index", () => {
  it("round-trips an index with every field through its JSON form, bigints included", () => {
    const index = fullIndex();
    const decoded = decodeProjectionIndex(JSON.parse(encodeProjectionIndex(index)));
    expect(decoded.success && decoded.data).toEqual(index);
  });

  it.each([
    ["at the top", (json: Record<string, unknown>) => ({ ...json, sweptAt: 1 })],
    ["inside an entry", (json: Record<string, unknown>) => {
      const entries = json["entries"] as Record<string, Record<string, unknown>>;
      return { ...json, entries: { ...entries, ".arc/backlog/planned/stray.md": { ...entries[".arc/backlog/planned/stray.md"], uid: "x" } } };
    }],
  ])("does not parse an index with a field it does not know %s", (_where, addField) => {
    const json = JSON.parse(encodeProjectionIndex(fullIndex())) as Record<string, unknown>;
    expect(decodeProjectionIndex(addField(json)).success).toBe(false);
  });

  it.each(["/repo/.arc/active/meta-alpha.md", ".arc/../outside.md"])("does not parse an entry keyed %s", (path) => {
    const json = JSON.parse(encodeProjectionIndex(fullIndex())) as Record<string, unknown>;
    const entries = json["entries"] as Record<string, unknown>;
    expect(decodeProjectionIndex({ ...json, entries: { [path]: entries[".arc/backlog/planned/stray.md"] } }).success)
      .toBe(false);
  });

  it.each([0, 2])("does not parse an index of format version %i", (format) => {
    const json = JSON.parse(encodeProjectionIndex(fullIndex())) as Record<string, unknown>;
    expect(decodeProjectionIndex({ ...json, format }).success).toBe(false);
  });
});
