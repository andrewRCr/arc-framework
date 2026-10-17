/** Status composes store facts with invocation-bound checkout and sync evidence. */
import { afterEach, expect, it, vi } from "vitest";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
it("adds an anchored holder, in-flight warnings and fetch reachability without changing lifecycle fields", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo", { owner: "alice" });
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, "demo", { json: true, fetch: true }, h.store, {
    findHoldingCheckout: async () => "/anchored-holder", readInFlightWarnings: async () => ["Malformed Errand other; repair its record."],
    sync: createStoreSyncPort({ pull: async () => ({ status: "unreachable", condition: "Offline", remedy: { text: "Reconnect" } }) }),
  });
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ slug: "demo", state: "active", owner: "alice", integrationBoundary: null,
    worktreePath: "/anchored-holder", warnings: ["Malformed Errand other; repair its record.", "Remote unreachable; query derived from local refs only."] });
});
it("reports a rejected holder lookup's condition instead of claiming no checkout", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo");
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, "demo", { json: true }, h.store, {
    findHoldingCheckout: async () => { throw new Error("Marker inventory unreadable; repair /holder marker."); }, readInFlightWarnings: async () => [],
  });
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ worktreePath: "Marker inventory unreadable; repair /holder marker." });
});
it("fetches before reading lifecycle, ownership and design facts", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "generate-tasks", owner: "alice", design: ["spec-demo.md"] });
  const design = await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Specification\n\n**Purpose:** Prior purpose.\n");
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, "demo", { json: true, fetch: true }, h.store, {
    findHoldingCheckout: async () => null, readInFlightWarnings: async () => [],
    sync: createStoreSyncPort({ pull: async () => {
      lifecycleSuccess(await h.store.batch({ writes: [
        { action: "put", reference: meta.reference, expected: meta.version, content: renderMetaFile("demo", { state: "Active", owner: "bob", design: ["spec-demo.md"] }), placement: { kind: "active" } },
        { action: "put", reference: design.reference, expected: design.version, content: "# Specification\n\n**Purpose:** Refreshed purpose.\n" },
      ], provenance: { verb: "pull", lifecycleAction: "pull" } }));
      return { status: "pulled" };
    } }),
  });
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ state: "active", owner: "bob", purpose: "Refreshed purpose." });
});
it("retains local status without invoking the pull port when fetch is absent", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo", { owner: "alice" });
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, "demo", { json: true }, h.store, {
    findHoldingCheckout: async () => null, readInFlightWarnings: async () => [],
    sync: createStoreSyncPort({ pull: async () => { throw new Error("Local status must not pull"); } }),
  });
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ owner: "alice", state: "active" });
});
