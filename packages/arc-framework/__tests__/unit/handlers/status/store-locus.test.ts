/** Status composes store facts with invocation-bound checkout and sync evidence. */
import { afterEach, expect, it, vi } from "vitest";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
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
