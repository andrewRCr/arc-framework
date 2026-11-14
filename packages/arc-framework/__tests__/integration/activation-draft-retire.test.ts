/** Activating over the ref backend removes a superseded draft in the write that flips the work unit to Active. */
import { afterEach, expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { runActivate, type ActivateContext } from "../../src/lib/work-unit/verbs/activate-deactivate.js";
import { buildStoreCurrentWuReconcile } from "../../src/lib/work-unit/store-current-wu-reconcile.js";
import { OwnerIdentitySchema, recordReferences, type Store } from "../../src/lib/store/index.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const ACTIVATION_TIMEOUT_MS = 30_000;
const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
const draft = recordReferences["work-item/draft"](owner);

async function planningUnit(options: { design: string[]; currentWorkflow: string; withDraft: boolean }) {
  root = await createTempRepo();
  const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Planning", currentWorkflow: options.currentWorkflow, design: options.design });
  if (options.withDraft) await h.seed(draft, "# Draft: example\n");
  const unsupported = async (): Promise<never> => { throw new Error("Unexpected in-repo adapter"); };
  const context = (store: Store): ActivateContext => ({ cwd: root!, store, exec, projectId: async () => "repo",
    indexFs: { readdir: unsupported, readFile: unsupported }, setPhase: unsupported, relocateArtifacts: unsupported,
    reconcileBranch: unsupported, reconcileWorkUnitWorktree: unsupported, writeSoftFields: unsupported,
    writeBranchField: unsupported, writeCurrentWorkflowField: unsupported, writeDesignField: unsupported,
    currentWuReconcile: buildStoreCurrentWuReconcile(root!, store) });
  const params = { name: "example", toBranch: "feat/example", baseBranch: "main", nextAction: "Begin work" };
  return { ...h, meta, exec, context, params };
}

/** A store whose first read of the draft lets a concurrent edit land just after it, so the read version goes stale. */
function editDraftAfterRead(h: Awaited<ReturnType<typeof planningUnit>>): Store {
  let edited = false;
  return new Proxy(h.store, { get(target, key, receiver) {
    if (key !== "read") { const value: unknown = Reflect.get(target, key, receiver); return typeof value === "function" ? value.bind(target) : value; }
    return async (request: Parameters<Store["read"]>[0]) => {
      const result = await target.read(request);
      if (!edited && result.status === "ok" && request.reference.kind === draft.kind) {
        edited = true;
        lifecycleSuccess(await target.write({ action: "put", reference: draft, expected: result.result.version,
          content: "# Draft: example\n\nEdited elsewhere.\n", provenance: { verb: "seed-lifecycle", lifecycleAction: "update" } }));
      }
      return result;
    };
  } });
}

it("removes a draft the design no longer names in the activation write", async () => {
  const h = await planningUnit({ design: ["spec-example.md"], currentWorkflow: "generate-tasks", withDraft: true });

  const result = await runActivate(h.context(h.store), h.params);

  expect(result).toMatchObject({ status: "activated", removedDraft: "draft-example.md" });
  expect(await h.store.read({ reference: draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).toMatchObject({ state: "Active" });
}, ACTIVATION_TIMEOUT_MS);

it("keeps a draft the design still names", async () => {
  const h = await planningUnit({ design: ["draft-example.md"], currentWorkflow: "draft-design", withDraft: true });

  const result = await runActivate(h.context(h.store), h.params);

  expect(result).toMatchObject({ status: "activated" });
  expect(result).not.toHaveProperty("removedDraft");
  expect(lifecycleSuccess(await h.store.read({ reference: draft })).content).toBe("# Draft: example\n");
}, ACTIVATION_TIMEOUT_MS);

it("activates a work unit with no draft without removing anything", async () => {
  const h = await planningUnit({ design: ["spec-example.md"], currentWorkflow: "generate-tasks", withDraft: false });

  const result = await runActivate(h.context(h.store), h.params);

  expect(result).toMatchObject({ status: "activated" });
  expect(result).not.toHaveProperty("removedDraft");
}, ACTIVATION_TIMEOUT_MS);

it("refuses the whole activation when the draft changed after its read, keeping the edited draft", async () => {
  const h = await planningUnit({ design: ["spec-example.md"], currentWorkflow: "generate-tasks", withDraft: true });

  const result = await runActivate(h.context(editDraftAfterRead(h)), h.params);

  expect(result).toMatchObject({ status: "rejected" });
  expect(lifecycleSuccess(await h.store.read({ reference: draft })).content).toContain("Edited elsewhere.");
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).toMatchObject({ state: "Planning" });
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("main");
}, ACTIVATION_TIMEOUT_MS);
