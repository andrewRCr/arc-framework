/** Marked checkouts require current, ready ownership; all other registrations retain their reason. */
import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyWindowCheckout, readWindowCheckouts, type WindowCheckoutKind } from "../../../../src/scripts/cutover-window/checkouts.js";
import { isWorktreeMarker, type WorktreeMarker, type WorktreeMarkerReadResult } from "../../../../src/lib/git/worktree-marker.js";
import type { RegisteredWorktree } from "../../../../src/lib/git/worktree-roster.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

const row: RegisteredWorktree = { path: "/checkout", head: "a".repeat(40), branch: "feat/alpha", detached: false,
  primary: false, folderPresent: true };
const base = { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z" };
const unit: WorktreeMarker = { ...base, createdFor: { kind: "work-unit", name: "alpha" } };
const claim = { kind: "errand" as const, slug: "example", claimId: "a".repeat(32) };
const partial: WorktreeMarker = { ...base, spawnedByArc: false, createdFor: { kind: "partial-errand", slug: "example", claimId: null },
  provisioning: "ready", parentCheckoutPath: "/parent", originEntry: "Example", originEntrySourceDigest: `sha256:${"b".repeat(64)}` };
const husked: WorktreeMarker = { ...unit, husk: { sha: row.head, at: base.createdAt,
  subject: { kind: "work-unit", name: "alpha" }, branch: "feat/alpha" } };
const present = (marker: WorktreeMarker): WorktreeMarkerReadResult => {
  expect(isWorktreeMarker(marker)).toBe(true);
  return { kind: "present", marker };
};

it.each<WorktreeMarker>([
  unit, { ...unit, spawnedByArc: false },
  ...(["errand", "groom", "housekeep"] as const).map(kind => ({ ...base, createdFor: { ...claim, kind }, provisioning: "ready" })),
])("recognizes current work-unit and ready transient ownership as marked: %j", marker => {
  expect(classifyWindowCheckout(row, present(marker))).toMatchObject({ kind: "marked", path: row.path });
});

it.each<{ kind: WindowCheckoutKind; marker: WorktreeMarkerReadResult; registration?: Partial<RegisteredWorktree> }>([
  { kind: "primary", marker: { kind: "absent" }, registration: { primary: true } },
  { kind: "no-marker", marker: { kind: "absent" } },
  { kind: "branch-subject", marker: present({ ...base, createdFor: { kind: "branch", ref: "spike/example" } }) },
  { kind: "partial-errand", marker: present(partial) },
  { kind: "manual-only", marker: present({ ...base, createdFor: { kind: "errand", slug: "legacy" } }) },
  { kind: "manual-only", marker: present({ ...base, createdFor: claim, provisioning: "future" }) },
  { kind: "pending", marker: present({ ...base, createdFor: claim, provisioning: "pending" }) },
  { kind: "malformed-marker", marker: { kind: "malformed", path: "/checkout/marker.json", message: "worktree marker contains malformed JSON" } },
  { kind: "missing-folder", marker: { kind: "absent" }, registration: { folderPresent: false } },
])("names the checkout state $kind", ({ kind, marker, registration }) => {
  expect(classifyWindowCheckout({ ...row, ...registration }, marker)).toMatchObject({ kind, path: row.path });
});

it("keeps a husk separate from unmarked checkout kinds and decodes its trust", () => {
  expect(classifyWindowCheckout(row, present(husked))).toMatchObject({ kind: "husk", husk: { kind: "legacy" } });
});

it("reports an unreadable registration inventory with a retry route", async () => {
  const repo = await mkdtemp(join(tmpdir(), "arc-window-checkouts-"));
  try {
    const boundary = scriptGitExec([{ match: { prefix: ["worktree", "list"] }, responses: [{ failure: { exitCode: 128 } },
      { stdout: `worktree ${repo}\0HEAD ${row.head}\0branch refs/heads/main\0\0` }] }]);
    const io = { repo, exec: boundary.exec };
    await expect(readWindowCheckouts(io)).rejects.toMatchObject({ findings: [expect.objectContaining({
      subject: "checkout registrations", remedy: expect.stringContaining("retry"),
    })] });
    await expect(readWindowCheckouts(io)).resolves.toMatchObject([{ path: repo, kind: "primary" }]);
  } finally { await rm(repo, { recursive: true, force: true }); }
});
