/** Store-first reads preserve identity independently of local state artifacts. */
import { afterEach, expect, it, vi, onTestFinished } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { resolveVerbTargetOrReport } from "../../../src/handlers/lifecycle.js";
import { makeWorktreeOccupancyGuard } from "../../../src/lib/work-unit/lifecycle-guards.js";
import { buildLifecycleIndexFromRecords } from "../../../src/lib/work-unit/lifecycle-index.js";
import { handleLifecycleStatus } from "../../../src/handlers/status/lifecycle.js";
import type { StoreLifecycleStatusPorts } from "../../../src/handlers/status/store-locus.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { createStore } from "../../../src/lib/store/create.js";
import { testStorePorts } from "../../helpers/store/in-repo-ports.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { resolveCohortValidationContext, validateFiles } from "../../../src/scripts/validate-cohort-consistency.js";
import { resolveBacklogStub } from "../../../src/lib/work-unit/backlog-stub.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { runGraduate } from "../../../src/commands/start.js";
import { writeMetaCohort } from "../../../src/lib/store/kinds/meta/writers.js";
import { resolveDraftPresent } from "../../../src/handlers/plan.js";

const quietLocusPorts: StoreLifecycleStatusPorts = {
  findHoldingCheckout: async () => null,
  readInFlightWarnings: async () => [],
};

async function checkoutClaim(name: string) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-consumer-claim-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name }, spawningIdentity: "test-user", now: 0 });
  return cwd;
}

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
it("context-defaulting resolves a held store identity without a local meta", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo");
  expect(await resolveVerbTargetOrReport("park", undefined, await checkoutClaim("demo"), false, h.store)).toBe("demo");
});
it("explicit former slug resolves to the selected work-unit identity", async () => {
  const h = createLifecycleHarness(); const old = await h.seedMeta("former");
  lifecycleSuccess(await h.store.write({ action: "put", reference: { ...old.reference, owner: { ...old.reference.owner, name: SlugSchema.parse("demo") } }, expected: old.version, content: old.content.replaceAll("former", "demo"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  expect(await resolveVerbTargetOrReport("park", "former", "/absent", false, h.store)).toBe("demo");
});
it("occupancy rejects a foreign held store unit without consulting the legacy reader", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("other");
  const reader = vi.fn(async () => ({ layout: "full" as const, candidates: [], warnings: [] }));
  const guard = makeWorktreeOccupancyGuard({ cwd: await checkoutClaim("other"), store: h.store, readActiveMetaCandidates: reader });
  expect(await guard({ slug: "demo", index: buildLifecycleIndexFromRecords([]), position: null, inputs: {} })).toMatchObject({ ok: false, message: expect.stringContaining("other") });
  expect(reader).not.toHaveBeenCalled();
});
it("status reads lifecycle details from the same store with bound local-locus evidence", async () => {
  const h = createLifecycleHarness(); const meta = await h.seedMeta("demo", { owner: "alice", design: ["spec-demo.md"] });
  await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Specification: demo\n\n**Purpose:** Make store reads work. More detail.\n");
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const exec = vi.fn(async () => { throw new Error("Record projection must use the supplied locus observations"); });
  await handleLifecycleStatus("/absent", exec, "demo", { json: true }, h.store, quietLocusPorts);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ slug: "demo", state: "active", owner: "alice", purpose: "Make store reads work.", integrationBoundary: null });
  expect(exec).not.toHaveBeenCalled();
});
it("draft presence follows the record identity even without a local state directory", async () => {
  const h = createLifecycleHarness(); const meta = await h.seedMeta("demo", {}, { kind: "backlog", commitment: "provisional" });
  await h.seed(recordReferences["work-item/draft"](meta.reference.owner), "# Draft: demo\n\nDraft.\n");
  expect(await resolveDraftPresent("/absent", "demo", h.store)).toBe(true);
  expect(await resolveDraftPresent("/absent", "missing", h.store)).toBe(false);
});

it("backlog stub lookup projects store-selected placement without reading local directories", async () => {
  const h = createLifecycleHarness();
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "core" })), "# Cohort: core\n\n**Purpose:** Group work.\n\n**Parent:** [none]\n");
  const meta = await h.seedMeta("demo", { state: "Planning", cohort: "core" }, { kind: "backlog", commitment: "planned" });
  await h.seed(recordReferences["work-item/draft"](meta.reference.owner), "# Draft: demo\n");
  expect(await resolveBacklogStub("/absent", "demo", h.store)).toEqual({ slug: "demo", stateDir: "planned",
    dir: "/absent/.arc/backlog/planned/core/demo", metaPath: "/absent/.arc/backlog/planned/core/demo/meta-demo.md", draftPath: "/absent/.arc/backlog/planned/core/demo/draft-demo.md" });
  expect(await resolveBacklogStub("/absent", "ghost", h.store)).toBeNull();
});

it("legacy reads use the bound store and preserve foreign occupancy", async () => {
  const cwd = await checkoutClaim("unused");
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, ".arc/active/meta-demo.md"), makeMetaFixture("demo"));
  const forbiddenGit = async () => { throw new Error("Read must not invoke Git"); };
  const store = createStore(testStorePorts(cwd, forbiddenGit, forbiddenGit));
  expect(await resolveVerbTargetOrReport("park", undefined, cwd, false, store)).toBe("demo");
  const reader = vi.fn(async () => ({ layout: "full" as const, candidates: [], warnings: [] }));
  const guard = makeWorktreeOccupancyGuard({ cwd, store, readActiveMetaCandidates: reader });
  expect(await guard({ slug: "other", index: buildLifecycleIndexFromRecords([]), position: null, inputs: {} })).toMatchObject({ ok: false, message: expect.stringContaining("demo") });
  expect(reader).not.toHaveBeenCalled();
});
it("status still answers a valid subject when an unrelated stored meta is malformed", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("demo"); await h.seedMeta("broken");
  const broken = [...h.store.state.records.values()].find((record) => record.reference.owner.name === "broken");
  if (broken === undefined) throw new Error("Missing seeded corruption basis");
  broken.content = "invalid metadata bytes";
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const exec = vi.fn(async () => { throw new Error("Use the supplied locus observations"); });
  await handleLifecycleStatus("/absent", exec, "demo", { json: true }, h.store, quietLocusPorts);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ slug: "demo", state: "active", warnings: [expect.stringContaining("broken")] });
  expect(exec).not.toHaveBeenCalled();
});

it("cohort validation derives activated membership from stored records instead of checkout files", async () => {
  const h = createLifecycleHarness();
  const content = "# Cohort: core\n\n**Purpose:** Group work.\n\n**Parent:** [none]\n\n## Members\n\n### `demo`\n\n_Exposes:_ A surface.\n";
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "core" })), content);
  await h.seedMeta("demo", { cohort: "core" });
  const resolved = await resolveCohortValidationContext("/absent", h.store);
  expect(resolved.diagnostics).toEqual([]);
  expect(resolved.context?.liveMembersByDir.get("core")).toEqual(new Set(["demo"]));
  expect(validateFiles([".arc/backlog/planned/core/cohort-core.md"], () => content, resolved.context, true)).toEqual({ pass: true, diagnostics: [] });
});

it.each(["missed", "diagnostic"])("cohort validation refuses an incomplete %s inventory and succeeds after repair", async (condition) => {
  const h = createLifecycleHarness();
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "core" })),
    "# Cohort: core\n\n**Purpose:** Group work.\n\n**Parent:** [none]\n");
  await h.seedMeta("demo", { cohort: "core" });
  let repaired = false;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "list") return async (input: Parameters<Store["list"]>[0]) => {
      const listing = await target.list(input);
      if (repaired || listing.status !== "ok" || listing.result.status !== "complete") return listing;
      return { status: "ok" as const, result: { ...listing.result, missed: condition === "missed",
        diagnostics: condition === "diagnostic" ? [{ kind: "malformed" as const, key: "missing-meta",
          condition: "A lifecycle record could not be decoded.", remedy: { text: "Repair missing-meta and retry." } }] : [] } };
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const refused = await resolveCohortValidationContext("/absent", store);
  expect(refused.context).toBeUndefined();
  expect(refused.diagnostics.length).toBeGreaterThan(0);
  expect(refused.diagnostics.join(" ")).toMatch(/repair.*retry/iu);
  if (condition === "diagnostic") expect(refused.diagnostics.join(" ")).toContain("Repair missing-meta and retry.");
  repaired = true;
  const complete = await resolveCohortValidationContext("/absent", store);
  expect(complete.diagnostics).toEqual([]);
  expect(complete.context?.liveMembersByDir.get("core")).toEqual(new Set(["demo"]));
});


it.each(["Not-A-Slug", "parent/child/grandchild", "parent//child"])("diagnoses unprojectable cohort %s and resumes after repair", async (cohort) => {
  const h = createLifecycleHarness();
  const healthy = await h.seedMeta("healthy", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  await h.seedMeta("broken", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  const raw = [...h.store.state.records.values()].find((record) => record.reference.owner.name === "broken");
  if (raw === undefined) throw Error("Missing corruption basis");
  const original = raw.content; raw.content = writeMetaCohort(original, cohort);
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await handleLifecycleStatus("/absent", async () => { throw Error("Use the supplied locus observations"); }, "healthy", { json: true }, h.store, quietLocusPorts);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ slug: "healthy", state: "planned",
    warnings: [expect.stringContaining("broken")] });
  const exec = async (_command: string, args: string[]) => {
    if (args[0] === "rev-parse") return { stdout: "a".repeat(40) };
    if (args[0] === "symbolic-ref") return { stdout: "refs/heads/person" };
    throw Error(`Unexpected Git operation: ${args.join(" ")}`);
  };
  const ctx = buildExecutorContext({ cwd: "/absent", io: { ...createUserIOContext(), exec }, store: h.store,
    identity: "test-user", teamMode: false, internalTemplateDir: "/templates", locusPorts: createDefaultLocusPorts() });
  let physical = 0;
  ctx.reconcileWorkUnitWorktree = async () => { physical++; return { mutation: "spawn", branch: null, worktreePath: "/spawn" }; };
  const params = { name: "healthy", spawningIdentity: "test-user", baseBranch: "main", locationTemplate: "/spawn", repo: "repo" };
  expect(await runGraduate(ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("broken") });
  expect(physical).toBe(0);
  expect(lifecycleSuccess(await h.store.read({ reference: healthy.reference }))).toEqual(healthy);
  raw.content = original; output.mockClear();
  await handleLifecycleStatus("/absent", async () => { throw Error("Use the supplied locus observations"); }, "healthy", { json: true }, h.store, quietLocusPorts);
  const repaired = JSON.parse(String(output.mock.calls[0]?.[0])) as { slug: string; warnings?: string[] };
  expect(repaired.slug).toBe("healthy"); expect(repaired.warnings ?? []).toEqual([]);
  expect(await runGraduate(ctx, params)).toMatchObject({ status: "graduated" });
  expect(physical).toBe(1);
  expect(lifecycleSuccess(await h.store.read({ reference: healthy.reference })).placement).toEqual({ kind: "active" });
});
