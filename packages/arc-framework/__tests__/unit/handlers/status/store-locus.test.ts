/** Status composes store facts with invocation-bound checkout and sync evidence. */
import { afterEach, expect, it, vi } from "vitest";
import { handleLifecycleStatus } from "../../../../src/handlers/status/lifecycle.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
it("refuses a disputed named primary while preserving healthy and missing queries, then resumes after resolution", async () => {
  const h = createLifecycleHarness(), meta = await h.seedMeta("demo", { owner: "starter", state: "Planning", currentWorkflow: "draft-design" });
  await h.seedMeta("healthy");
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const other = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  for (const [store, owner] of [[h.store, "alice"], [other, "bob"]] as const) {
    const prior = lifecycleSuccess(await store.read({ reference: meta.reference }));
    lifecycleSuccess(await store.write({ action: "put", reference: prior.reference, expected: prior.version,
      content: renderMetaFile("demo", { owner, state: "Planning", currentWorkflow: "draft-design" }), placement: { kind: "active" },
      provenance: { verb: "test", lifecycleAction: "update" } }));
  }
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const query = async (slug: string) => {
    output.mockClear();
    await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, slug, { json: true }, h.store,
      { findHoldingCheckout: async () => "/holder", readInFlightWarnings: async () => [] });
    return JSON.parse(String(output.mock.calls[0]?.[0])) as Record<string, unknown>;
  };
  expect(await query("healthy")).toMatchObject({ state: "active" });
  expect(await query("missing")).toMatchObject({ state: "nonexistent" });
  const result = await query("demo");
  expect(result).toMatchObject({ status: "refused", refusal: { class: "recoverable", remedy: { text: expect.stringMatching(/resolve.*retry/isu) } } });
  expect(result).not.toHaveProperty("owner"); expect(result).not.toHaveProperty("purpose"); expect(result).not.toHaveProperty("state");
  for (const reference of disputed.conflicts) expect(JSON.stringify(result)).toContain(JSON.stringify(reference).replaceAll('"', '\\"'));
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    content: disputed.content, placement: { kind: "active" }, links: disputed.links, resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await query("demo")).toMatchObject({ state: "planning", occupied: true, worktreePath: "/holder" });
});
it("adds an anchored holder, in-flight warnings and fetch reachability without changing lifecycle fields", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo", { owner: "alice" });
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  let offline = true;
  const sync = createStoreSyncPort({ pull: async () => offline
    ? { status: "unreachable", condition: "Offline", remedy: { text: "Reconnect" } }
    : { status: "pulled" } });
  const ports = {
    findHoldingCheckout: async () => "/anchored-holder", readInFlightWarnings: async () => ["Malformed Errand other; repair its record."], sync,
  };
  await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, "demo", { json: true, fetch: true }, h.store, {
    ...ports,
  });
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ slug: "demo", state: "active", owner: "alice", integrationBoundary: null,
    worktreePath: "/anchored-holder", warnings: ["Malformed Errand other; repair its record.", expect.stringMatching(/Offline.*Reconnect/u)] });
  offline = false; output.mockClear();
  await handleLifecycleStatus("/current", async () => { throw new Error("Injected ports own local reads"); }, "demo", { json: true, fetch: true }, h.store, ports);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ owner: "alice", state: "active", worktreePath: "/anchored-holder",
    warnings: ["Malformed Errand other; repair its record."] });
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


it("retains remote designation choices and command in fetched status, then refreshes after designation", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo");
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  let designated = false;
  const ports = { findHoldingCheckout: async () => null, readInFlightWarnings: async () => [],
    sync: createStoreSyncPort({ pull: async () => designated ? { status: "pulled" } : {
      status: "designation-needed", remote: "backup", choices: ["state", "code-and-state"],
      remedy: { text: "Choose the state role.", argv: ["arc", "store", "remote", "backup", "state"] },
    } }) };
  const query = async () => {
    output.mockClear();
    await handleLifecycleStatus("/current", async () => { throw new Error("Unexpected Git"); }, "demo", { json: true, fetch: true }, h.store, ports);
    return JSON.parse(String(output.mock.calls[0]?.[0])) as { warnings: string[] };
  };
  expect((await query()).warnings).toEqual([expect.stringMatching(/backup.*state, code-and-state.*Choose the state role.*arc store remote backup state/u)]);
  designated = true;
  expect((await query()).warnings ?? []).toEqual([]);
});
