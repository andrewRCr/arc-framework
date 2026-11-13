/** Lock admission applies only to marked linked registrations without any Git lock. */
import { expect, it } from "vitest";
import { classifyWindowCheckout } from "../../../../src/scripts/cutover-window/checkouts.js";
import { windowCheckoutLockFindings } from "../../../../src/scripts/cutover-window/lock.js";
import type { RegisteredWorktree } from "../../../../src/lib/git/worktree-roster.js";
import type { WorktreeMarkerReadResult } from "../../../../src/lib/git/worktree-marker.js";

const row: RegisteredWorktree = { path: "/checkout", head: "a".repeat(40), branch: "feat/alpha", detached: false,
  primary: false, folderPresent: true };
const marked: WorktreeMarkerReadResult = { kind: "present", marker: { spawnedByArc: true, spawningIdentity: "andrew",
  createdAt: "2026-01-01T00:00:00.000Z", createdFor: { kind: "work-unit", name: "alpha" } } };

it.each<{ title: string; registration: RegisteredWorktree; marker: WorktreeMarkerReadResult; refuses: boolean }>([
  { title: "unlocked marked link", registration: row, marker: marked, refuses: true },
  { title: "primary", registration: { ...row, primary: true }, marker: { kind: "absent" }, refuses: false },
  { title: "unmarked link", registration: row, marker: { kind: "absent" }, refuses: false },
  { title: "lock without a reason", registration: { ...row, locked: null }, marker: marked, refuses: false },
  { title: "existing reason", registration: { ...row, locked: "Another tool's reason" }, marker: marked, refuses: false },
])("requires a lock only for an $title", ({ registration, marker, refuses }) => {
  const findings = windowCheckoutLockFindings([classifyWindowCheckout(registration, marker)]);
  expect(findings).toEqual(refuses ? [{ subject: row.path, condition: expect.stringContaining("unlocked"),
    remedy: expect.stringContaining("lock") }] : []);
});
