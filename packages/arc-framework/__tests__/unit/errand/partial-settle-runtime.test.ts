/** Partial Errand terminal absence and authority boundaries. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digestBytes } from "../../../src/lib/kernel/index.js";
import { writeWorktreeMarker, readWorktreeMarker, readWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { settlePartialErrandAtRuntime } from "../../../src/lib/errand/partial-settle-runtime.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

function primaryRow(kind: "free-primary" | "unresolved-checkout" = "free-primary"): DerivedCheckoutRow {
  return {
    kind,
    checkout: {
      folderPresent: true,
      path: "/repo",
      head: "a".repeat(40),
      branch: "main",
      detached: false,
      primary: true,
    },
    subject: null,
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: kind === "free-primary"
      ? []
      : [{ code: "authority-evidence-unreadable", source: "marker", message: "bad marker" }],
  };
}

function frame(primary = primaryRow(), siblings: readonly DerivedCheckoutRow[] = []): DerivedLocusFrame {
  return {
    roster: [primary, ...siblings],
    entering: { kind: "selected", row: primary },
    primaryAvailability: primary.kind === "free-primary"
      ? { kind: "free", checkoutPath: primary.checkout.path }
      : { kind: "unsafe", checkoutPath: primary.checkout.path, reasons: ["unresolved"] },
    identityDiscovery: { kind: "absent" },
    active: null,
  };
}

function unresolvedSibling(): DerivedCheckoutRow {
  return {
    ...primaryRow("unresolved-checkout"),
    checkout: {
      folderPresent: true,
      path: "/repo/sibling",
      head: "b".repeat(40),
      branch: "chore/other",
      detached: false,
      primary: false,
    },
  };
}

function options(state: DerivedLocusFrame) {
  return {
    slug: "direct-fix",
    action: "close" as const,
    base: "main",
    exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    readFrame: async () => state,
    settleInbox: vi.fn(async () => ({ kind: "idempotent" as const, nextOffer: null })),
  };
}

describe("partial Errand settlement", () => {
  it("accepts idempotent absence only from the exact current free primary", async () => {
    const result = await settlePartialErrandAtRuntime(options(frame()));
    expect(result).toMatchObject({ outcome: "idempotent" });
  });

  it("contains an unrelated malformed sibling while preserving proven absence", async () => {
    const result = await settlePartialErrandAtRuntime(options(frame(primaryRow(), [unresolvedSibling()])));
    expect(result).toMatchObject({ outcome: "idempotent" });
  });

  it("refuses absence when the current primary marker evidence is unresolved", async () => {
    const result = await settlePartialErrandAtRuntime(options(frame(primaryRow("unresolved-checkout"))));
    expect(result).toMatchObject({ outcome: "refused", reason: "authority-unresolved" });
  });
});

it("settles a version-bound capture before releasing the partial marker", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-partial-origin-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const entry = "personal:abcd1234", version = "v1:0123456789abcdef", head = "a".repeat(40);
  await writeWorktreeMarker(cwd, { spawnedByArc: false,
    createdFor: { kind: "partial-errand", slug: "direct-fix", claimId: null }, provisioning: "ready",
    originEntry: entry, originEntryVersion: version, spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00.000Z" });
  const marker = await readWorktreeMarkerGeneration(cwd);
  if (marker.kind !== "present") throw new Error("Missing fixture marker");
  const occupied: DerivedCheckoutRow = { ...primaryRow(), kind: "transient",
    checkout: { ...primaryRow().checkout, path: cwd }, subject: { kind: "partial-errand", key: "direct-fix", claimId: null },
    markerGeneration: digestBytes(marker.bytes), origin: { entry, version } };
  const entries = new Map([[entry, version]]);
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "rev-parse") return { stdout: args[1] === "--abbrev-ref" ? "main" : head };
    if (["check-ref-format", "fetch", "update-ref", "status"].includes(args[0] ?? "")) return { stdout: "" };
    throw new Error(`Unexpected Git command: ${args.join(" ")}`);
  };
  const result = await settlePartialErrandAtRuntime({ ...options(frame(occupied)), exec,
    settleInbox: async (binding) => {
      if (binding.originEntry === null || entries.get(binding.originEntry) !== binding.originEntryVersion)
        return { kind: "refused", reason: "The capture version changed." };
      entries.delete(binding.originEntry);
      return { kind: "applied", nextOffer: null };
    },
  });
  expect(result).toMatchObject({ outcome: "applied" });
  expect(entries.has(entry)).toBe(false);
  expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
});
