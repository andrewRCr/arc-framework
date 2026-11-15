/** A path's import owner determines its read coordinate independently of the inspected branch. */
import { expect, it } from "vitest";
import { resolveWindowPathRead } from "../../../../src/scripts/cutover-window/read-map.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";

const main = "1".repeat(40), tip = "2".repeat(40), path = ".arc/active/notes-alpha.md";
const reference = RecordReferenceSchema.parse({ kind: "work-item/notes", owner: { type: "work-item", name: "alpha" } });
const source = { readRevision: tip, readCopyRef: "refs/heads/feat/alpha" };

it("retains a live record's operational branch and immutable read revision", () => {
  expect(resolveWindowPathRead({ path, reference, main, source })).toEqual({ path, reference, workUnit: "alpha", ...source });
});

it("retains unavailable live input rather than substituting main", () => {
  const absent = { readRevision: null, readCopyRef: null };
  expect(resolveWindowPathRead({ path, reference, main, source: absent })).toEqual({ path, reference, workUnit: "alpha", ...absent });
});

it("reads a parked pointer at main while retaining its named branch", () => {
  expect(resolveWindowPathRead({ path, reference, main, source, pointerBranch: "feat/alpha" })).toEqual({
    path, reference, workUnit: "alpha", readRevision: main, readCopyRef: "refs/heads/main", pointerBranch: "feat/alpha",
  });
});

it("reads lineage at main even when the origin name also has live work", () => {
  const lineage = RecordReferenceSchema.parse({ ...reference, kind: "lineage/transition" });
  expect(resolveWindowPathRead({ path, reference: lineage, main, source })).toEqual({
    path, reference: lineage, workUnit: "alpha", readRevision: main, readCopyRef: "refs/heads/main",
  });
});

it("assigns an unclaimed file to main with no logical owner", () => {
  expect(resolveWindowPathRead({ path, reference: null, main, source })).toEqual({
    path, reference: null, workUnit: null, readRevision: main, readCopyRef: "refs/heads/main",
  });
});
