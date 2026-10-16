/**
 * Unit tests for the shared lifecycle-verb binding shape ({@link resolveVerbTargetOrReport}).
 * The pure dispatch core (target selection, candidate derivation) is tested in
 * `dispatch.test.ts`; these cover the handler glue the core can't: the
 * current-WU fallback read, mode-gated default resolution, and the non-interactive
 * candidate-list-and-exit surface.
 *
 * The current-WU cases use checked store records and real marker bytes;
 * legacy candidate rendering keeps its index double and prompt boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import type { LifecycleIndex, LifecycleIndexEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { Location, Phase } from "../../../src/lib/work-unit/lifecycle-state.js";

const mockLogError = vi.fn();
vi.mock("@clack/prompts", () => ({ log: { error: (...args: unknown[]) => mockLogError(...args) } }));

const mockBuildLifecycleIndex = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/work-unit/lifecycle-index.js")>(),
  buildLifecycleIndex: (...args: unknown[]) => mockBuildLifecycleIndex(...args),
}));

const { resolveVerbTargetOrReport, TeardownCommandInputSchema, FinalizeCommandInputSchema } = await import("../../../src/handlers/lifecycle.js");

function entry(slug: string, phase: Phase, location: Location): LifecycleIndexEntry {
  return { slug, phase, location, cohort: null, dependsOn: [], path: `.arc/${location}/meta-${slug}.md` };
}

function indexWith(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((e) => [e.slug, e]));
}

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
});

const checkoutRoots: string[] = [];
afterEach(async () => {
  process.exitCode = undefined;
  await Promise.all(checkoutRoots.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })));
});
async function checkoutClaim(name?: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "arc-lifecycle-binding-")); checkoutRoots.push(cwd);
  if (name !== undefined) await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name }, spawningIdentity: "test-user", now: 0 });
  return cwd;
}

describe("resolveVerbTargetOrReport — explicit slug", () => {
  it("resolves directly without reading the current WU or the index", async () => {
    const slug = await resolveVerbTargetOrReport("park", "widget", "/repo");
    expect(slug).toBe("widget");
    expect(mockBuildLifecycleIndex).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});

describe("resolveVerbTargetOrReport — context-defaulting, no slug", () => {
  it("falls back to the single current worktree's WU", async () => {
    const h = createLifecycleHarness(); await h.seedMeta("current-wu");
    const slug = await resolveVerbTargetOrReport("park", undefined, await checkoutClaim("current-wu"), false, h.store);
    expect(slug).toBe("current-wu");
    expect(mockBuildLifecycleIndex).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("surfaces the candidate list and exits when no unambiguous current WU resolves", async () => {
    const h = createLifecycleHarness(); await h.seedMeta("live");
    await h.seedMeta("shelved", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
    const slug = await resolveVerbTargetOrReport("park", undefined, await checkoutClaim(), false, h.store);
    expect(slug).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(mockLogError).toHaveBeenCalledWith("Active: `live` · usage `arc park <slug>`");
  });
});

describe("resolveVerbTargetOrReport — slug-required, no slug", () => {
  it("never reads the current WU and lists the valid candidates non-interactively", async () => {
    mockBuildLifecycleIndex.mockResolvedValue(indexWith(entry("shelved", "Active", "planned")));
    const slug = await resolveVerbTargetOrReport("resume", undefined, "/repo");
    expect(slug).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(mockLogError).toHaveBeenCalledWith("Parked: `shelved` · usage `arc resume <slug>`");
  });
});

describe("teardown command input", () => {
  it.each([
    "/repo/worktree",
    String.raw`C:\repo\worktree`,
  ])("accepts cross-platform absolute husk path %s", (husk) => {
    assertSchemaAccepts(TeardownCommandInputSchema, { name: "widget", husk });
  });

  it("rejects a relative husk path", () => {
    assertSchemaRefuses(TeardownCommandInputSchema, { name: "widget", husk: "../worktree" });
  });
});

describe("finalize command input", () => {
  it("accepts the amend-design Class write and rejects missing Class or unknown fire-points", () => {
    assertSchemaAccepts(FinalizeCommandInputSchema, { firePoint: "amend-design", class: "Heavy" });
    assertSchemaRefuses(FinalizeCommandInputSchema, { firePoint: "amend-design" });
    assertSchemaRefuses(FinalizeCommandInputSchema, { firePoint: "verify", class: "Heavy" });
  });
});
