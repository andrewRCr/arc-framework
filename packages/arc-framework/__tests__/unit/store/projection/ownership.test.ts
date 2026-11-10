/** Projection eligibility from the primary flag and the checkout's real marker file. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWorktreeMarkerPath, type WorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { checkoutHoldsProjection } from "../../../../src/lib/store/projection/ownership.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";

let checkout: string;
let location: ProjectionLocation;
beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "arc-projection-ownership-"));
  location = { gitDir: join(checkout, ".git"), commonDir: join(checkout, "common"), primary: false, stateDir: join(checkout, "state") };
});
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const marker = { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-11-10T00:00:00Z" };
async function hold(value: unknown): Promise<void> {
  await mkdir(join(checkout, ".arc/system/.internal"), { recursive: true });
  await writeFile(resolveWorktreeMarkerPath(checkout), JSON.stringify(value));
}

describe("projection eligibility", () => {
  it("gives the primary a projection without a marker", async () => {
    expect(await checkoutHoldsProjection(checkout, { ...location, primary: true })).toBe(true);
  });

  it("gives a work-unit checkout a projection even when claimed in place", async () => {
    await hold({ ...marker, spawnedByArc: false, createdFor: { kind: "work-unit", name: "alpha" } } satisfies WorktreeMarker);
    expect(await checkoutHoldsProjection(checkout, location)).toBe(true);
  });

  it.each(["errand", "groom", "housekeep", "partial-errand"] as const)("gives a ready %s claim a projection", async kind => {
    await hold({ ...marker, createdFor: { kind, slug: "alpha", claimId: kind === "partial-errand" ? null : "a".repeat(32) }, provisioning: "ready" });
    expect(await checkoutHoldsProjection(checkout, location)).toBe(true);
  });

  it.each([
    { createdFor: { kind: "branch", ref: "chore/decompose-alpha" } },
    { createdFor: { kind: "errand", slug: "alpha", claimId: "a".repeat(32) }, provisioning: "pending" },
    { createdFor: { kind: "errand", slug: "alpha", claimId: "a".repeat(32) }, provisioning: "future" },
    { createdFor: { kind: "errand", slug: "alpha" } },
    { createdFor: { kind: "work-unit", name: "alpha" }, husk: { branch: "feat/alpha", sha: "abc", at: "2026-11-10T00:00:00Z", subject: { kind: "work-unit", name: "alpha" } } },
  ])("leaves machinery, pending, manual-only, and husked checkouts without a projection: %j", async ownership => {
    await hold({ ...marker, ...ownership });
    expect(await checkoutHoldsProjection(checkout, location)).toBe(false);
  });

  it("leaves an unclaimed checkout without a projection", async () => {
    expect(await checkoutHoldsProjection(checkout, location)).toBe(false);
  });
});
