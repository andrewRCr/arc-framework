/** Partial Errand terminal absence and authority boundaries. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digestBytes } from "../../../src/lib/kernel/index.js";
import { writeWorktreeMarker, readWorktreeMarker, readWorktreeMarkerGeneration } from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { settleStorePartialCapture } from "../../../src/handlers/errand-entry-storage.js";
import { settlePartialErrandAtRuntime } from "../../../src/lib/errand/partial-settle-runtime.js";
import { passingProjectionRemovalSlots } from "../../../src/lib/git/worktree-removal.js";
import { listInbox } from "../../../src/lib/inbox/listing.js";
import { setErrandQueue } from "../../../src/lib/inbox/queue.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import { createInboxHarness, entry } from "../../helpers/inbox-harness.js";
import { success, update } from "../../helpers/store/suite-tools.js";

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

async function versionBoundPartial(version = "v1:0123456789abcdef") {
  const cwd = await mkdtemp(join(tmpdir(), "arc-partial-origin-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const entry = "personal:abcd1234", head = "a".repeat(40);
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
  const settle = { ...options(frame(occupied)), exec,
    settleInbox: async (binding: { originEntry: string | null; originEntryVersion?: string }) => {
      if (binding.originEntry === null || entries.get(binding.originEntry) !== binding.originEntryVersion)
        return { kind: "refused" as const, reason: "The capture version changed." };
      entries.delete(binding.originEntry);
      return { kind: "applied" as const, nextOffer: null };
    },
  };
  return { cwd, entry, entries, settle };
}

it("settles a version-bound capture before releasing the partial marker", async () => {
  const h = await versionBoundPartial();
  const result = await settlePartialErrandAtRuntime(h.settle);
  expect(result).toMatchObject({ outcome: "applied" });
  expect(h.entries.has(h.entry)).toBe(false);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
});

it("closes with the next remaining capture when the queue becomes malformed as inbox removal lands", async () => {
  const h = createInboxHarness();
  const ids = ["abcd1234", "22222222"];
  await h.inbox("personal", [entry("abcd1234", "Closing"), entry("22222222", "Next")].join("\n\n"));
  const before = await listInbox({ list: "personal" }, h.context);
  if (before.state === "refused" || !before.entries[0]) throw new Error("Missing origin capture");
  const partial = await versionBoundPartial(before.entries[0].version);
  expect((await setErrandQueue({ schemaVersion: 1, members: ids.map(id => ({ inbox: "personal", id })) }, h.context)).state).toBe("set");

  const queue = success(await h.context.store.read({ reference: h.fixture.reference("personal/errand-queue") }));
  const malformed = queue.content.replace(/- _Rank:_ `[^`]+`/u, "- _Rank:_ `bad rank`");
  expect(malformed).not.toBe(queue.content);
  const write = h.context.store.write.bind(h.context.store);
  vi.spyOn(h.context.store, "write").mockImplementationOnce(async input => {
    expect(input.reference.kind).toBe("personal/inbox");
    const removed = await write(input);
    success(removed);
    success(await write(update(h.fixture, queue, malformed)));
    return removed;
  });

  const result = await settlePartialErrandAtRuntime({
    ...partial.settle,
    settleInbox: async binding => (await settleStorePartialCapture(binding, h.context)).outcome,
  });
  const after = await listInbox({ list: "personal" }, h.context);
  expect({
    outcome: result.outcome,
    captures: after.state === "refused" ? after.reason : after.entries.map(row => row.id),
    marker: (await readWorktreeMarker(partial.cwd)).kind,
  }, result.recommendedPromptText).toEqual({ outcome: "applied", captures: ["22222222"], marker: "absent" });
  expect(result).toMatchObject({ nextOffer: { key: "personal:22222222" } });
});

it("refuses before settling its capture while the primary's projection release would refuse, then closes", async () => {
  const h = await versionBoundPartial();
  let held = true;
  const slots = { ...passingProjectionRemovalSlots, check: async (...args: Parameters<typeof passingProjectionRemovalSlots.check>) =>
    held ? { kind: "would-refuse" as const, remedy: { text: "Save the held edit, then retry." } } : passingProjectionRemovalSlots.check(...args) };
  const refused = await settlePartialErrandAtRuntime({ ...h.settle, projectionRemovalSlots: slots });
  expect(refused).toMatchObject({ outcome: "refused", reason: "preservation-unproven",
    recommendedPromptText: expect.stringContaining("Save the held edit, then retry.") });
  expect(h.entries.has(h.entry)).toBe(true);
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present" });
  held = false;
  expect(await settlePartialErrandAtRuntime({ ...h.settle, projectionRemovalSlots: slots })).toMatchObject({ outcome: "applied" });
  expect(h.entries.has(h.entry)).toBe(false);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
});
