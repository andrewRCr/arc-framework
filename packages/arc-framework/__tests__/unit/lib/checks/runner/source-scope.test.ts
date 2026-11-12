/** Scoped presentation dependencies remain separate from whole-artifact identity. */
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { SourceManifestEntry } from "../../../../../src/lib/checks/runner/contract-source.js";
import { identifySourceManifest } from "../../../../../src/lib/checks/runner/source-manifest.js";
import { indexSourcePresentation } from "../../../../../src/lib/checks/runner/source-scope.js";

function file(path: string, content: string): SourceManifestEntry {
  return { path, kind: "file", mode: 0o644, digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    bytes: Buffer.byteLength(content) };
}
function source(selected: SourceManifestEntry, unrelated = file("notes/plan.md", "plan\n"), tree = "a".repeat(40)) {
  const identity = identifySourceManifest({ version: 1, coordinates: { tree, merged: [] }, entries: [selected, unrelated] });
  return { ...identity, codePaths: new Map([["CODE.TS", selected.path], ["notes/plan.md", unrelated.path]]) };
}

it("labels a dependency by its catalog path and retains its actual stored name and bytes", () => {
  const selected = file("code.ts", "code\n");
  const read = indexSourcePresentation(source(selected)).read("CODE.TS");
  expect(read).toEqual({ status: "present", path: "CODE.TS", entry: selected });
});

it("changes whole-artifact identity for unrelated source and coordinates while retaining the scoped read", () => {
  const selected = file("code.ts", "code\n");
  const before = source(selected);
  const after = source(selected, file("notes/plan.md", "changed plan\n"), "b".repeat(40));
  expect(before.digest).not.toBe(after.digest);
  const read = indexSourcePresentation(before).read("CODE.TS");
  expect(read.status).toBe("present");
  expect(indexSourcePresentation(after).read("CODE.TS")).toEqual(read);
});

it.each([file("code.ts", "changed code\n"), file("Code.ts", "code\n")])(
  "changes the scoped read when selected bytes or stored spelling change", selected => {
    const before = indexSourcePresentation(source(file("code.ts", "code\n"))).read("CODE.TS");
    const after = indexSourcePresentation(source(selected)).read("CODE.TS");
    expect(before.status).toBe("present");
    expect(after.status).toBe("present");
    expect(after).not.toEqual(before);
  });

it.each(["missing mapping", "missing entry", "invalid entry", "duplicate entry"])("keeps %s unavailable instead of inventing absence or content", fault => {
  const view = source(file("code.ts", "code\n"));
  if (fault === "missing mapping") view.codePaths.delete("CODE.TS");
  else if (fault === "missing entry") view.codePaths.set("CODE.TS", "absent.ts");
  else {
    const entry = view.manifest.entries.find(value => value.path === "code.ts");
    if (entry?.kind !== "file") throw new Error("Expected selected file");
    if (fault === "invalid entry") entry.digest = "sha256:invalid";
    else view.manifest.entries.push({ ...entry });
  }
  const index = indexSourcePresentation(view);
  expect(index.read("CODE.TS")).toMatchObject({ status: "unavailable", path: "CODE.TS" });
  expect(index.read("notes/plan.md").status).toBe("present");
});

it("retains literal symlink targets as scoped presentation material", () => {
  const before: SourceManifestEntry = { path: "links/code", kind: "symlink", target: "../missing-one" };
  const after: SourceManifestEntry = { ...before, target: "../missing-two" };
  const lookup = (entry: SourceManifestEntry, tree: string) => indexSourcePresentation({
    manifest: identifySourceManifest({ version: 1, coordinates: { tree, merged: [] }, entries: [entry] }).manifest,
    codePaths: new Map([["LINKS/CODE", "links/code"]]),
  }).read("LINKS/CODE");
  expect(lookup(before, "a".repeat(40))).toEqual({ status: "present", path: "LINKS/CODE", entry: before });
  expect(lookup(after, "b".repeat(40))).toEqual({ status: "present", path: "LINKS/CODE", entry: after });
});
