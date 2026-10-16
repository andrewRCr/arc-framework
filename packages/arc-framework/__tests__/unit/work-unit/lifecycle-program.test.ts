/** One checked owner retains its branch provenance across the lifecycle program. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import { runActivate, runDeactivate, type ActivateContext } from "../../../src/lib/work-unit/verbs/activate-deactivate.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";
import { buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";
import { createStorePromotionSteps } from "../../../src/lib/errand/promote-store.js";
import { promoteOrdinaryErrand } from "../../../src/lib/errand/promote.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { GitExec, RawGitExec } from "../../../src/lib/git/exec.js";
import type { LocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
const base = "0".repeat(40), personal = "1".repeat(40), planning = "2".repeat(40);
function repository() {
  const state = { current: null as string | null, head: base, commits: [] as string[], branches: new Map([["main", base]]), marker: "demo" };
  const calls: string[][] = [];
  const exec: GitExec = async (_command, args) => {
    calls.push(args);
    const absent = (): never => { throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "absent" }); };
    if (args[0] === "symbolic-ref") return state.current === null ? absent() : { stdout: state.current };
    if (args[0] === "remote" || args[0] === "check-ref-format") return { stdout: "" };
    if (args.includes("rev-parse")) {
      const ref = (args.at(-1) ?? "").replace(/\^\{commit\}$/u, "");
      if (ref === "HEAD") return { stdout: state.head };
      const tip = state.branches.get(ref.replace("refs/heads/", "")); return tip === undefined ? absent() : { stdout: tip };
    }
    if (args.includes("rev-list")) return { stdout: state.commits.join("\n") };
    if (args.includes("merge-base")) return { stdout: "" };
    if (args[0] === "for-each-ref") return { stdout: args[1] === "--format=%(upstream)" ? "" : args.slice(2).filter((ref) => state.branches.has(ref.replace("refs/heads/", ""))).join("\n") };
    if (args[0] === "branch" && args[1] === "-m") {
      const from = args[2] ?? "", to = args[3] ?? "";
      state.branches.set(to, state.branches.get(from) ?? state.head); state.branches.delete(from); if (state.current === from) state.current = to;
      return { stdout: "" };
    }
    if (args[0] === "branch") { state.branches.set(args[1] ?? "", args[2] ?? state.head); return { stdout: "" }; }
    if (args[0] === "switch") {
      state.current = args[1] === "-c" ? args[2] ?? null : args[1] === "--detach" ? null : args[1] ?? null;
      state.head = args[1] === "-c" ? args[3] ?? state.head : state.current === null ? args[2] ?? state.head : state.branches.get(state.current) ?? state.head;
      if (state.current !== null) state.branches.set(state.current, state.head); return { stdout: "" };
    }
    throw new Error(`Unexpected scripted Git operation: ${args.join(" ")}`);
  };
  const raw: RawGitExec = async (_args, request) => ({ stdout: Buffer.from(Buffer.from(request?.input ?? []).toString().trim().split("\n").filter(Boolean).map((sha) => `${sha} missing\n`).join("")) });
  const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async ({ name }) => name === state.marker ? "/holder" : null, writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
  return { state, exec, raw, calls, locusPorts };
}
function executor(h: ReturnType<typeof createLifecycleHarness>, git: ReturnType<typeof repository>): ActivateContext {
  const forbidden = async (): Promise<never> => { throw new Error("No tracked lifecycle mutation applies"); };
  return { store: h.store, cwd: "/holder", exec: git.exec, execRaw: git.raw, projectId: async () => "repo", locusPorts: git.locusPorts,
    indexFs: { readFile: forbidden, readdir: forbidden }, setPhase: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    relocateArtifacts: forbidden, writeSoftFields: forbidden, writeBranchField: forbidden, writeCurrentWorkflowField: forbidden, writeDesignField: forbidden,
    currentWuReconcile: buildStoreCurrentWuReconcile(h.store) };
}
it.each(["created", "adopted"] as const)("keeps one UID and sticky %s provenance through activation, deactivation, reactivation and rename", async (linkedAs) => {
  const h = createLifecycleHarness(), git = repository();
  const primary = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" });
  const read = () => h.store.read({ reference: primary.reference }).then(lifecycleSuccess);
  expect(git.state.current).toBeNull(); expect((await read()).links?.branches ?? []).toEqual([]);
  if (linkedAs === "adopted") { git.state.current = "person"; git.state.head = personal; git.state.commits = [personal]; git.state.branches.set("person", personal); }
  const ctx = executor(h, git), params = { name: "demo", toBranch: "feat/demo", baseBranch: "main", nextAction: "Begin work" };
  expect(await runActivate(ctx, params)).toMatchObject({ status: "activated" });
  const initial = await read(); expect(initial.reference.owner).toEqual(primary.reference.owner);
  const firstExclusions = linkedAs === "created" ? [] : [{ repository: "repo", sha: personal }];
  expect(initial.links?.branches).toEqual([{ repository: "repo", ref: "feat/demo", linkedAs, excluded: firstExclusions }]);
  expect(await runDeactivate(ctx, { name: "demo", baseBranch: "main" })).toMatchObject({ status: "deactivated" });
  expect((await read()).links).toEqual(initial.links); expect(git.state.current).toBe("feat/demo");
  git.state.commits.push(planning); git.state.head = planning; git.state.branches.set("feat/demo", planning);
  expect(await runActivate(ctx, params)).toMatchObject({ status: "activated" });
  const active = await read(); expect(active.reference.owner).toEqual(primary.reference.owner);
  expect(active.links?.branches).toEqual([{ repository: "repo", ref: "feat/demo", linkedAs, excluded: [...firstExclusions, { repository: "repo", sha: planning }] }]);
  expect(await runStoreRename({ ...ctx, store: h.store, exec: git.exec, baseBranch: "main", renameCheckout: async (request) => {
    git.state.marker = request.targetSlug;
    return { report: { checkout: { kind: "renamed", checkoutPath: "/holder", markerGeneration: "renamed" } }, rollback: async () => { git.state.marker = request.sourceSlug; } };
  } }, { sourceSlug: "demo", targetSlug: "renamed" })).toMatchObject({ status: "renamed" });
  const renamed = await read(); expect(renamed.reference.owner).toEqual({ ...primary.reference.owner, name: "renamed" });
  expect(renamed.links?.branches).toEqual(active.links?.branches?.map((link) => ({ ...link, ref: "feat/renamed" })));
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") })).reference).toEqual(renamed.reference);
  expect(git.state.current).toBe("feat/renamed"); expect(git.state.marker).toBe("renamed");
});
it("promotes a second owner through the real adapter, then rename keeps its Errand branch and retargets only its work branch", async () => {
  const h = createLifecycleHarness(), git = repository();
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "errand-source" }), claimId = "a".repeat(32);
  const identity = { version: 3, slug: "errand-source", claimId, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
    kind: "errand", purpose: "errand", intent: "Useful work", branch: "chore/errand-source", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null };
  const primary = await h.seed(recordReferences["work-item/record"](owner), JSON.stringify(identity), { kind: "active" },
    { branches: [{ repository: "repo", ref: identity.branch, linkedAs: "created", excluded: [] }] });
  git.state.branches.set(identity.branch, personal); git.state.current = identity.branch; git.state.head = personal; git.state.marker = "promoted";
  const options = { store: h.store, exec: git.exec, cwd: "/holder", repository: "repo", slug: "errand-source", name: "promoted", type: "feat", floor: "derivation" as const,
    owner: "test-user", class: "Light", checkout: async () => ({ kind: "ready" as const, checkoutPath: "/holder", allocation: "primary" as const, parentCheckoutPath: null }) };
  expect(await promoteOrdinaryErrand({ ...options, protection: "full", dependencies: { ...createStorePromotionSteps(options),
    settleInbox: async (frame) => frame, settleOccupancy: async (frame) => frame } })).toMatchObject({ outcome: "applied" });
  const promoted = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(promoted.reference).toMatchObject({ kind: "work-item/meta", owner: { ...primary.reference.owner, name: "promoted" } });
  expect(promoted.links?.branches).toEqual([...primary.links!.branches!, { repository: "repo", ref: "feat/promoted", linkedAs: "created", excluded: [] }]);
  expect(await runStoreRename({ store: h.store, exec: git.exec, cwd: "/holder", baseBranch: "main", projectId: async () => "repo",
    locusPorts: { ...git.locusPorts, findHoldingCheckout: async () => null } }, { sourceSlug: "promoted", targetSlug: "renamed-promotion" })).toMatchObject({ status: "renamed", keptBranches: [identity.branch] });
  const renamed = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(renamed.links?.branches).toEqual([primary.links!.branches![0], { repository: "repo", ref: "feat/renamed-promotion", linkedAs: "created", excluded: [] }]);
  expect(git.state.branches.get(identity.branch)).toBe(personal);
});
