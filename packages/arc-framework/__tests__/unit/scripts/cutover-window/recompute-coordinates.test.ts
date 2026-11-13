/** Recompute compares complete local/fetched inventories and only the recorded host branches. */
import { expect, it } from "vitest";
import { windowRecomputeCoordinateFindings } from "../../../../src/scripts/cutover-window/recompute-coordinates.js";
import type { WindowRecord } from "../../../../src/scripts/cutover-window/hold.js";

const tip = "a".repeat(40), next = "b".repeat(40);
function record(): WindowRecord {
  return { version: 1, flip: { branch: "feat/flip", pullRequest: 7, head: tip }, worktrees: [], reviewGateDigest: "c".repeat(64),
    branches: { local: { main: tip, "feat/flip": tip }, origin: { main: tip, "feat/flip": tip },
      host: { main: tip, "feat/flip": tip }, live: { "feat/flip": { local: tip, origin: tip, reasons: ["Window flip"] } } },
    refs: { local: {}, origin: {}, tracking: {} } };
}

it.each(["local", "origin", "host"] as const)("reports a moved or deleted %s branch with both tips", side => {
  for (const mode of ["moved", "deleted"] as const) {
    const held = record(), current = structuredClone(held);
    if (mode === "moved") current.branches[side].main = next;
    else delete current.branches[side].main;
    const findings = windowRecomputeCoordinateFindings(held, current);
    expect(findings).toEqual([expect.objectContaining({ subject: `${side}:main`,
      condition: expect.stringContaining(tip), remedy: expect.stringContaining("restore") })]);
    expect(findings[0]?.condition).toContain(mode === "moved" ? next : "null");
  }
});

it.each(["local", "origin"] as const)("reports an added %s branch", side => {
  const held = record(), current = structuredClone(held);
  current.branches[side]["new/branch"] = next;
  expect(windowRecomputeCoordinateFindings(held, current)).toEqual([expect.objectContaining({ subject: `${side}:new/branch`,
    condition: expect.stringContaining(next) })]);
});

it("ignores an unrelated new host branch", () => {
  const held = record(), current = structuredClone(held);
  current.branches.host["unrelated/branch"] = next;
  expect(windowRecomputeCoordinateFindings(held, current)).toEqual([]);
});

it("exempts only the recorded flip tips and checkout head while retaining other comparisons", () => {
  const held = record();
  held.worktrees = [{ path: "flip-checkout", head: tip, branch: held.flip.branch, personalDigest: "d".repeat(64) }];
  const current = structuredClone(held);
  for (const side of ["local", "origin", "host"] as const) current.branches[side][held.flip.branch] = next;
  const checkout = current.worktrees[0];
  if (!checkout) throw new Error("The flip checkout is absent");
  checkout.head = next;
  expect(windowRecomputeCoordinateFindings(held, current)).toHaveLength(4);
  expect(windowRecomputeCoordinateFindings(held, current, true)).toEqual([]);
  current.reviewGateDigest = "e".repeat(64);
  expect(windowRecomputeCoordinateFindings(held, current, true)).toEqual([
    expect.objectContaining({ subject: "review gate" }),
  ]);
});
