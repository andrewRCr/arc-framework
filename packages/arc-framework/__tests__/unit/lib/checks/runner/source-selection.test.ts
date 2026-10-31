/** Certified coordinates retain historical scope independently from presentation bytes. */
import { expect, it } from "vitest";
import { requireSourceCoordinates } from "../../../../../src/lib/checks/runner/source-selection.js";
import type { ResolvedCheckRequest } from "../../../../../src/lib/checks/resolve-request.js";

const tree = "a".repeat(40);
const head = "b".repeat(40);
const base = "c".repeat(40);
const merged = ["d".repeat(40), "e".repeat(40)];

it("retains the checked tree, logical HEAD, base and ordered merged coordinates", () => {
  const request: ResolvedCheckRequest = { scope: { kind: "range" }, tree, base, merged,
    source: { kind: "commit", commit: head, head: { status: "known", commit: head } } };
  const coordinates = requireSourceCoordinates(request);
  expect(coordinates).toEqual({ tree, head, base, merged });
  coordinates.merged.reverse();
  expect(request.merged).toEqual(["d".repeat(40), "e".repeat(40)]);
});

it.each([
  { name: "unavailable HEAD", patch: { source: { kind: "worktree", head: { status: "unavailable" } } } },
  { name: "invalid tree", patch: { tree: "invalid" } },
  { name: "invalid HEAD", patch: { source: { kind: "worktree", head: { status: "known", commit: "invalid" } } } },
  { name: "invalid base", patch: { base: "invalid" } },
  { name: "invalid merged parent", patch: { merged: ["invalid"] } },
] satisfies { name: string; patch: Partial<ResolvedCheckRequest> }[])("refuses $name with a repair and retry route", ({ patch }) => {
  expect(() => requireSourceCoordinates({ scope: { kind: "all" }, tree,
    source: { kind: "worktree", head: { status: "unborn" } }, ...patch }))
    .toThrow(/repair.*retry.*local/iu);
});

it("omits HEAD only for verified unborn evidence and does not invent a base", () => {
  expect(requireSourceCoordinates({ scope: { kind: "all" }, tree,
    source: { kind: "worktree", head: { status: "unborn" } } })).toEqual({ tree, merged: [] });
});
