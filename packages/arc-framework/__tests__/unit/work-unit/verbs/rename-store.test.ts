/** Renames preserve one UID and change only the records in the transform's authority. */
import { expect, it } from "vitest";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { recordKey } from "../../../helpers/store/model.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { LocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => null, writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
it("refuses a changed caller primary even when acquisition sees the newer version", async () => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("source", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  const git = scriptGitExec([]);
  const result = await runStoreRename({ store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main", locusPorts,
    onPreparedAdvisories: async () => { lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
      placement: { kind: "backlog", commitment: "provisional" }, content: primary.content, provenance: { verb: "edit", lifecycleAction: "edit" } })); } },
  { sourceSlug: "source", targetSlug: "target" });
  expect(result).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).reference.owner.name).toBe("source"); expect(git.calls).toEqual([]);
});
it("rewrites the cohort member and exact artifact references in the same batch as its member", async () => {
  const h = createLifecycleHarness();
  const cohort = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    "# Cohort: group\n\n**Purpose:** Group work.\n\n## Members\n\n### `source`\n\n_Exposes:_ See `spec-source.md`.\n");
  const primary = await h.seedMeta("source", { cohort: "group" });
  const git = scriptGitExec([]);
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main", locusPorts }, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed" });
  const document = lifecycleSuccess(await h.store.read({ reference: cohort.reference }));
  expect(document.content).toContain("### `target`"); expect(document.content).toContain("`spec-target.md`");
  const primaryHistory = lifecycleSuccess(await h.store.history({ reference: primary.reference }));
  const cohortHistory = lifecycleSuccess(await h.store.history({ reference: cohort.reference }));
  const primaryProvenance = primaryHistory[0]?.provenance;
  if (primaryProvenance === undefined || !("batchId" in primaryProvenance)) throw new Error("Missing batch provenance");
  expect(cohortHistory[0]?.provenance).toMatchObject({ batchId: primaryProvenance.batchId });
});
it("refuses an occupied target or incomplete inventory before invoking any physical adapter", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("source"); await h.seedMeta("target");
  const git = scriptGitExec([]), ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main", locusPorts };
  expect(await runStoreRename(ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "rejected", refusal: { code: "record-malformed" } });
  const saved = h.store.state.records.get(recordKey(primary.reference)); if (saved === undefined) throw new Error("Missing fixture record");
  saved.content = "Malformed metadata";
  expect(await runStoreRename(ctx, { sourceSlug: "source", targetSlug: "unused" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("source") });
  expect(git.calls).toEqual([]);
});
it("renames a paused work unit's group and shared stubs in one batch while in-flight dependents keep the old alias", async () => {
  const h = createLifecycleHarness();
  const original = await h.seedMeta("source", { taskList: "tasks-source.md" });
  lifecycleSuccess(await h.store.write({ action: "put", reference: original.reference, expected: original.version, placement: { kind: "active" },
    content: writeMetaPause(original.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const primary = lifecycleSuccess(await h.store.read({ reference: original.reference }));
  const tasks = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), "# Task List: source\n\n## **Phase 1:** Build\n\n### `[ ]` **1.1 Build**\n\nRead `spec-source.md`.\n");
  const stub = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["source"] }, { kind: "backlog", commitment: "provisional" });
  const live = await h.seedMeta("live", { dependsOn: ["source"] });
  const integrating = await h.seedMeta("integrating", { state: "Integrating", currentWorkflow: "integrate-work-unit", dependsOn: ["source"] });
  const git = scriptGitExec([]);
  const result = await runStoreRename({ store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main", locusPorts }, { sourceSlug: "source", targetSlug: "target" });
  expect(result).toMatchObject({ status: "renamed", shape: "in-place", pendingIntegration: false, advisories: [expect.stringContaining("integrating")] });
  const renamed = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(renamed.reference.owner.name).toBe("target"); expect(renamed.fields).toMatchObject({ taskList: "tasks-target.md", pause: expect.objectContaining({ reason: "Wait." }) });
  expect(lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("source") })).reference).toEqual(renamed.reference);
  expect(lifecycleSuccess(await h.store.read({ reference: tasks.reference })).content).toContain("# Task List: target");
  expect(lifecycleSuccess(await h.store.read({ reference: tasks.reference })).content).toContain("`spec-target.md`");
  expect(lifecycleSuccess(await h.store.read({ reference: stub.reference })).fields).toMatchObject({ dependsOn: ["target"] });
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.read({ reference: integrating.reference }))).toEqual(integrating);
  const latest = lifecycleSuccess(await h.store.history({ reference: renamed.reference }))[0];
  const stubLatest = lifecycleSuccess(await h.store.history({ reference: stub.reference }))[0];
  expect(latest?.provenance).toMatchObject({ verb: "rename", batchId: expect.any(String) });
  expect(stubLatest?.provenance).toMatchObject({ verb: "rename", batchId: (latest?.provenance as { batchId?: string }).batchId });
  expect(git.calls).toEqual([]);
});
it("renames an archived owner without a holder and preserves its assigned archive number", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("source", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const git = scriptGitExec([]);
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main", locusPorts }, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toMatchObject({ reference: { owner: { name: "target" } }, placement: primary.placement });
  expect(git.calls).toEqual([]);
});

it("renames a stub without a branch switch or second change request", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("source", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  const git = scriptGitExec([]);
  expect(await runStoreRename({ store: h.store, cwd: "/transient", exec: git.exec, baseBranch: "main", locusPorts }, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed", shape: "stub", pendingIntegration: false });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toMatchObject({ reference: { owner: { name: "target" } }, placement: primary.placement });
  expect(git.calls).toEqual([]);
});
async function branchFixture(linkedAs: "created" | "adopted" = "created", failPush = false, detached = false) {
  const h = createLifecycleHarness(), sha = "1".repeat(40), refs = new Set(["feat/source"]);
  const link = { repository: "repo", ref: "feat/source", linkedAs, excluded: [{ repository: "repo", sha: "a".repeat(40) }] };
  const primary = await h.seedMeta("source", detached ? { state: "Planning", currentWorkflow: "draft-design" } : {}, { kind: "active" }, { branches: [link] });
  let remotePresent = true;
  const git = scriptGitExec([
    { match: ["remote"], responses: [{ stdout: "origin" }] },
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: detached ? [{ failure: { exitCode: 1, stderr: "detached" } }] : [() => ({ stdout: [...refs][0] ?? "" })] },
    { match: ["ls-remote", "--heads", "origin", "refs/heads/feat/source"], responses: [() => ({ stdout: remotePresent ? `${sha}\trefs/heads/feat/source` : "" })] },
    { match: { prefix: ["for-each-ref", "--format=%(refname)"] }, responses: [(call) => ({ stdout: call.args.slice(2).filter((ref) => refs.has(ref.replace("refs/heads/", ""))).join("\n") })] },
    { match: { prefix: ["for-each-ref", "--format=%(upstream)"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["branch", "-m"] }, responses: [(call) => { const from = call.args[2], to = call.args[3]; if (from === undefined || to === undefined) throw new Error("Missing rename operands"); refs.delete(from); refs.add(to); return { stdout: "" }; }] },
    { match: ["push", "-u", "origin", "feat/target"], responses: failPush ? [{ failure: { exitCode: 128, stderr: "offline" } }, { stdout: "" }] : [{ stdout: "" }] },
    { match: ["push", "origin", `--force-with-lease=refs/heads/feat/source:${sha}`, ":refs/heads/feat/source"], responses: [() => { remotePresent = false; return { stdout: "" }; }] },
  ]);
  return { ...h, primary, link, refs, git, ctx: { store: h.store, exec: git.exec, cwd: "/repo", baseBranch: "main", projectId: async () => "repo", locusPorts } };
}
it("renames a detached Planning holder through its final qualified work link", async () => {
  const h = await branchFixture("created", false, true);
  expect(await runStoreRename({ ...h.ctx, locusPorts: { ...locusPorts, findHoldingCheckout: async () => "/holder/source" },
    renameCheckout: async () => ({ report: { checkout: { kind: "renamed", checkoutPath: "/holder/target", markerGeneration: "renamed" } }, rollback: async () => {} }) },
  { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed" });
  expect(h.refs).toEqual(new Set(["feat/target"]));
});
it("a refused batch never reverses a local branch that this invocation found already renamed", async () => {
  const h = await branchFixture(); h.refs.delete("feat/source"); h.refs.add("feat/target");
  let raced = false;
  const exec: typeof h.git.exec = async (command, args, options) => {
    const result = await h.git.exec(command, args, options);
    if (!raced && args[0] === "for-each-ref" && args[1] === "--format=%(refname)") {
      raced = true; lifecycleSuccess(await h.store.write({ action: "put", reference: h.primary.reference, expected: h.primary.version,
        content: h.primary.content, placement: { kind: "active" }, provenance: { verb: "race", lifecycleAction: "advance-version" } }));
    }
    return result;
  };
  expect(await runStoreRename({ ...h.ctx, exec }, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(h.refs).toEqual(new Set(["feat/target"])); expect(h.git.calls.some((call) => call.args[0] === "branch")).toBe(false);
});
it("rolls back a successful local rename when the mutator's later upstream read fails", async () => {
  const h = await branchFixture(); let failed = false;
  const exec: typeof h.git.exec = async (command, args, options) => {
    if (!failed && args[1] === "--format=%(upstream)") { failed = true; throw new Error("Upstream inspection failed"); }
    return h.git.exec(command, args, options);
  };
  expect(await runStoreRename({ ...h.ctx, exec }, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("Upstream inspection failed") });
  expect(h.refs).toEqual(new Set(["feat/source"]));
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).version).toBe(h.primary.version);
});
it("renames a created linked branch before its batch and carries exclusions to its replacement link", async () => {
  const h = await branchFixture();
  expect(await runStoreRename(h.ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed", remote: { status: "renamed" } });
  const renamed = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  expect(renamed.links?.branches).toEqual([{ ...h.link, ref: "feat/target" }]);
  expect(h.refs).toEqual(new Set(["feat/target"]));
  expect(h.git.calls.map((call) => call.args)).toContainEqual(["branch", "-m", "feat/source", "feat/target"]);
});
it("keeps an adopted branch outside ARC forms and reports it without changing its link", async () => {
  const h = createLifecycleHarness(); const link = { repository: "repo", ref: "user/investigation", linkedAs: "adopted" as const, excluded: [] };
  const primary = await h.seedMeta("source", {}, { kind: "active" }, { branches: [link] }); const git = scriptGitExec([]);
  expect(await runStoreRename({ store: h.store, exec: git.exec, cwd: "/repo", baseBranch: "main", projectId: async () => "repo", locusPorts },
    { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed", keptBranches: ["user/investigation"] });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).links?.branches).toEqual([link]); expect(git.calls).toEqual([]);
});
it("renames an adopted ARC-form link, publishes its new name, and keeps the person's old remote ref", async () => {
  const h = await branchFixture("adopted");
  expect(await runStoreRename(h.ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed", remote: { status: "retained", oldBranch: "feat/source" } });
  expect(h.git.calls.some((call) => call.args.some((arg) => arg.startsWith(":refs/heads/")))).toBe(false);
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).links?.branches).toEqual([{ ...h.link, ref: "feat/target" }]);
});
it("a failed remote leg leaves the record renamed and its typed rerun finishes only the post-batch legs", async () => {
  const h = await branchFixture("created", true);
  expect(await runStoreRename(h.ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "partial", remedy: { argv: ["arc", "rename", "source", "target"] } });
  const renamed = lifecycleSuccess(await h.store.read({ reference: h.primary.reference })); expect(renamed.reference.owner.name).toBe("target");
  const operations = h.git.calls.filter((call) => call.args[0] === "branch").length;
  expect(await runStoreRename(h.ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed", recordBatch: "existing" });
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).version).toBe(renamed.version);
  expect(h.git.calls.filter((call) => call.args[0] === "branch")).toHaveLength(operations);
});
it("a changed acquired record refuses the batch and rolls back branch, marker, and checkout name", async () => {
  const h = await branchFixture(); let marker = "source", checkoutPath = "/holder/source";
  const held: LocusPorts = { ...locusPorts, findHoldingCheckout: async () => checkoutPath };
  const result = await runStoreRename({ ...h.ctx, locusPorts: held, renameCheckout: async (request) => {
    marker = request.targetSlug; checkoutPath = "/holder/target";
    lifecycleSuccess(await h.store.write({ action: "put", reference: h.primary.reference, expected: h.primary.version, content: h.primary.content, placement: { kind: "active" }, provenance: { verb: "race", lifecycleAction: "advance-version" } }));
    return { report: { checkout: { kind: "renamed", checkoutPath, markerGeneration: "changed" } },
      rollback: async () => { marker = "source"; checkoutPath = "/holder/source"; } };
  } }, { sourceSlug: "source", targetSlug: "target" });
  expect(result).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(marker).toBe("source"); expect(checkoutPath).toBe("/holder/source"); expect(h.refs).toEqual(new Set(["feat/source"]));
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).reference.owner.name).toBe("source");
  expect(h.git.calls.some((call) => call.args[0] === "push")).toBe(false);
});
