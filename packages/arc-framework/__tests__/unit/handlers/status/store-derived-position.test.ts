/** Store-backed slug queries retain lifecycle generation and checkout-derived scope. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../../helpers/status-context.js";
import { runHandlerAt } from "../../../helpers/handler.js";
import type { DerivedCheckoutRow } from "../../../../src/lib/locus/derived-roster.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { MetaPauseSchema } from "../../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";

async function fixture() {
  const h = createLifecycleHarness();
  const cwd = await mkdtemp(join(tmpdir(), "arc-store-position-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const context = await createTestStatusContext({ store: h.store, cwd, identity: "reader" });
  return { ...h, cwd, context };
}

const quiet = { findHoldingCheckout: async () => null, readInFlightWarnings: async () => [] };

function row(path: string): DerivedCheckoutRow {
  const item = { id: "1.1", title: "Continue work", lineHint: 5 };
  return { checkout: { path, head: "a".repeat(40), branch: "feat/demo", detached: false, primary: false, folderPresent: true },
    markerGeneration: `sha256:${"b".repeat(64)}`, parentCheckoutPath: null, origin: null, identity: null,
    context: { kind: "resolved", metaPath: ".arc/active/meta-demo.md", owner: "alice", branch: "feat/demo",
      sessionType: "execution", workflow: "process-task-loop", stage: null, taskListPath: ".arc/active/tasks-demo.md",
      taskCursor: { status: "found", cursor: { section: item, leaf: item } }, workUnitStage: "task-work",
      cohortDocPath: null, loadSet: { manifestVersion: 1, entries: [] }, integrationBoundary: null },
    lifecycleLocation: "active", diagnostics: [], kind: "work-unit", subject: { kind: "work-unit", key: "demo" } };
}

it("reports the live holder's state when a shipped generation reused its slug", async () => {
  const h = await fixture();
  const old = await h.seedMeta("reused", { state: "Shipped", currentWorkflow: null });
  lifecycleSuccess(await h.store.write({ ...recordPut(old, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  await h.seedMeta("reused", { state: "Planning", currentWorkflow: "draft-design" });
  const result = await runHandlerAt(h.cwd, () => handleLifecycleStatus(h.context, "reused", { json: true }, quiet));
  expect(JSON.parse(result.stdout)).toMatchObject({ slug: "reused", state: "planning", occupied: true });
});

it.each([false, true])("reports checkout-derived position and scope as the reading identity (json=%s)", async json => {
  const h = await fixture();
  const meta = await h.seedMeta("demo", { owner: "alice", taskList: "tasks-demo.md" });
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), "# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Continue work**\n");
  const ports = { ...quiet, findHoldingCheckout: async () => "Holder observation unavailable; repair its marker.",
    readRoster: async (identity: string) => { if (identity !== "reader") throw new Error("Wrong reading identity"); return [row(h.cwd)]; } };
  const result = await runHandlerAt(h.cwd, () => handleLifecycleStatus(h.context, "demo", { json }, ports));
  expect(result.exitCode).toBe(0);
  if (json) expect(JSON.parse(result.stdout)).toMatchObject({ derivedPosition: { checkoutPath: h.cwd,
    sessionType: "execution", workUnitStage: "task-work", openTask: { id: "1.1", title: "Continue work" } },
    scopeWindow: { window: "gated", basis: "checkout" } });
  else {
    expect(result.stdout + result.stderr).toContain("stage: execution · task-work · task 1.1 Continue work");
    expect(result.stdout + result.stderr).toContain("scope window: gated");
  }
});

it("retains a failed roster's repair route beside the lifecycle-only scope", async () => {
  const h = await fixture(); await h.seedMeta("demo");
  const ports = { ...quiet, findHoldingCheckout: async () => "/holder",
    readRoster: async () => { throw new Error("Roster unavailable. Repair the checkout registration and retry."); } };
  const result = await runHandlerAt(h.cwd, () => handleLifecycleStatus(h.context, "demo", { json: true }, ports));
  expect(JSON.parse(result.stdout)).toMatchObject({ derivedPosition: null, scopeWindow: { window: null, basis: "lifecycle" },
    warnings: [expect.stringMatching(/Derived position.*Roster unavailable.*Repair.*retry/u)] });
});

it("keeps a paused work unit's window null even when its checkout has an execution position", async () => {
  const h = await fixture();
  const meta = await h.seedMeta("demo");
  lifecycleSuccess(await h.store.write({ ...recordPut(meta, { content: writeMetaPause(meta.content,
    MetaPauseSchema.parse({ pausedBy: "alice", since: "2026-10-01T12:00:00.000Z", reason: "Waiting" })) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const ports = { ...quiet, findHoldingCheckout: async () => "/holder", readRoster: async () => [row(h.cwd)] };
  const result = await runHandlerAt(h.cwd, () => handleLifecycleStatus(h.context, "demo", { json: true }, ports));
  expect(JSON.parse(result.stdout)).toMatchObject({ derivedPosition: { sessionType: "execution" },
    scopeWindow: { window: null, basis: "lifecycle", reason: "paused; a routed concern waits for its resumption" } });
});
