/** The run plans act only on checkouts a work unit's marker holds, whatever a transient claim's branch sorts as. */
import { expect, it } from "vitest";
import { classifyWindowCheckout } from "../../../../src/scripts/cutover-window/checkouts.js";
import { workUnitRehearsalCheckouts } from "../../../../src/scripts/cutover-window/rehearse-plan-tools.js";
import type { WorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import type { RegisteredWorktree } from "../../../../src/lib/git/worktree-roster.js";

const base = { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z" };
const claim = { slug: "example", claimId: "a".repeat(32) };
const row = (path: string, branch: string | null, primary = false): RegisteredWorktree =>
  ({ path, head: "a".repeat(40), branch, detached: branch === null, primary, folderPresent: true });
const unit = (name: string): WorktreeMarker => ({ ...base, createdFor: { kind: "work-unit", name } });
const transient = (kind: "errand" | "groom" | "housekeep"): WorktreeMarker =>
  ({ ...base, createdFor: { ...claim, kind }, provisioning: "ready" });

it("selects work-unit checkouts in branch order, passing over ready transient claims that sort first", () => {
  const checkouts = [
    classifyWindowCheckout(row("/beta", "feat/beta"), { kind: "present", marker: unit("beta") }),
    classifyWindowCheckout(row("/groom", "chore/groom-set"), { kind: "present", marker: transient("groom") }),
    classifyWindowCheckout(row("/errand", "chore/example"), { kind: "present", marker: transient("errand") }),
    classifyWindowCheckout(row("/housekeep", "aaa/sweep"), { kind: "present", marker: transient("housekeep") }),
    classifyWindowCheckout(row("/alpha", "feat/alpha"), { kind: "present", marker: unit("alpha") }),
    classifyWindowCheckout(row("/detached", null), { kind: "present", marker: unit("gamma") }),
    classifyWindowCheckout(row("/primary", "main", true), { kind: "absent" }),
  ];
  expect(checkouts.filter(checkout => checkout.kind === "marked")).toHaveLength(6);
  expect(workUnitRehearsalCheckouts(checkouts).map(({ path, branch, unit }) => ({ path, branch, unit }))).toEqual([
    { path: "/alpha", branch: "feat/alpha", unit: "alpha" },
    { path: "/beta", branch: "feat/beta", unit: "beta" },
  ]);
});
