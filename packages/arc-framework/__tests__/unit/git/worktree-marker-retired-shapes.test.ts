/** Retired marker shapes refuse ownership until current evidence replaces them. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker, type WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";

const current: WorktreeMarker = {
  spawnedByArc: true, wuName: "widget", spawningIdentity: "andrew", createdAt: "2026-11-12T00:00:00Z",
  husk: { sha: "a".repeat(40), at: "2026-11-12T00:00:00Z", subject: { kind: "work-unit", name: "widget" },
    branch: "feat/widget", authorization: "discard-confirmed", remoteRef: null,
    evidence: { kind: "git-transition", transition: "abandon", resultDigest: `sha256:${"b".repeat(64)}` } },
};

describe("retired marker shapes", () => {
  let cwd: string;
  beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), "arc-marker-retired-")); });
  afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

  async function refuseThenRepair(value: unknown, repaired: WorktreeMarker): Promise<void> {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value));
    expect(await readWorktreeMarker(cwd)).toMatchObject({ kind: "malformed", path });
    await writeWorktreeMarker(cwd, repaired);
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: repaired });
  }

  it.each(["authorization", "remoteRef", "evidence", "all"] as const)("refuses a husk missing %s until its complete proof is restored", async field => {
    const husk: Record<string, unknown> = { ...current.husk };
    for (const key of field === "all" ? ["authorization", "remoteRef", "evidence"] : [field]) Reflect.deleteProperty(husk, key);
    await refuseThenRepair({ ...current, husk }, current);
  });

  it("refuses an Errand without a claim until current claim provenance replaces it", async () => {
    const marker = { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-11-12T00:00:00Z",
      createdFor: { kind: "errand", slug: "widget" } };
    const repaired: WorktreeMarker = { ...marker,
      createdFor: { kind: "errand", slug: "widget", claimId: "a".repeat(32) }, provisioning: "ready" };
    await refuseThenRepair(marker, repaired);
  });
});
