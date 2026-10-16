/** Activation and deactivation over checked reference records and a scripted repository. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { makeGitProcessError } from "../../../helpers/git-exec-fake.js";
import type { GitExec, RawGitExec } from "../../../../src/lib/git/exec.js";
import { runActivate, runDeactivate, type ActivateContext } from "../../../../src/lib/work-unit/verbs/activate-deactivate.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";
import type { BranchLink } from "../../../../src/lib/store/links.js";
import type { PreparedCurrentWuReconcile } from "../../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { transientContent } from "../../../helpers/store/in-repo-substrates.js";

const base = "0".repeat(40), local = "1".repeat(40), remote = "2".repeat(40);
async function harness(options: { branch?: string | null; commits?: string[]; link?: BranchLink; remoteHead?: string; taken?: boolean; noBase?: boolean } = {}) {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design", workClass: "Novel" }, { kind: "active" }, options.link === undefined ? undefined : { branches: [options.link] });
  let current = options.branch === undefined ? null : options.branch;
  let head = options.commits?.length ? local : base;
  const branches = new Map<string, string>(options.noBase ? [] : [["main", base]]);
  if (current !== null) branches.set(current, head);
  if (options.taken) branches.set("feat/demo", local);
  let reconciled = false;
  const exec: GitExec = async (_command, args) => {
    const fail = () => { throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "not present" }); };
    if (args[0] === "symbolic-ref") return current === null ? fail() : { stdout: current };
    if (args[0] === "remote") return { stdout: options.remoteHead === undefined ? "" : "origin" };
    if (args[0] === "fetch") return { stdout: "" };
    if (args.includes("rev-parse")) {
      const ref = (args.at(-1) ?? "").replace(/\^\{commit\}$/u, "");
      if (ref === "HEAD") return { stdout: head };
      if (ref.startsWith("refs/remotes/origin/")) return options.remoteHead === undefined || (options.noBase && ref.endsWith("/main")) ? fail() : { stdout: ref.endsWith("/main") ? base : options.remoteHead };
      const tip = branches.get(ref.replace("refs/heads/", "")); return tip === undefined ? fail() : { stdout: tip };
    }
    if (args.includes("rev-list")) return { stdout: [...(options.commits ?? []), ...(options.remoteHead === undefined ? [] : [options.remoteHead])].join("\n") };
    if (args.includes("merge-base")) return options.remoteHead === args.at(-2) && !(options.commits ?? []).includes(args.at(-2) ?? "") ? fail() : { stdout: "" };
    if (args[0] === "switch") { current = args[2] ?? null; head = args[3] ?? head; if (current !== null) branches.set(current, head); return { stdout: "" }; }
    if (args[0] === "branch" && args[1] === "-m") {
      const from = args[2] ?? "", to = args[3] ?? ""; branches.set(to, branches.get(from) ?? head); branches.delete(from); if (current === from) current = to; return { stdout: "" };
    }
    if (args[0] === "update-ref" && args[1] === "-d") { branches.delete((args[2] ?? "").replace("refs/heads/", "")); return { stdout: "" }; }
    throw Error(`Unexpected git operation: ${args.join(" ")}`);
  };
  const raw: RawGitExec = async (_args, request) => ({ stdout: Buffer.from(Buffer.from(request?.input ?? []).toString().trim().split("\n").filter(Boolean).map((sha) => `${sha} missing\n`).join("")) });
  const prepared: PreparedCurrentWuReconcile = { slug: "demo", edits: [], plan: { status: "ready", dependency: { before: [], after: [], replacements: [], drops: [], discharged: [], live: [], conflicts: [] }, trackedReferences: { edits: [] }, advisories: [] } };
  const ctx: ActivateContext = {
    cwd: "/repo", store: h.store, projectId: async () => "repo", exec, execRaw: raw,
    indexFs: { readdir: async () => { throw Error("store arm must not read checkout paths"); }, readFile: async () => { throw Error("store arm must not read checkout paths"); } },
    setPhase: async () => ({ phase: "Planning" }), relocateArtifacts: async () => ({ moved: [] }),
    reconcileBranch: async () => { throw Error("store arm must use its supplied Git step"); }, reconcileWorkUnitWorktree: async () => { throw Error("activation stays in place"); },
    writeSoftFields: async () => {}, writeBranchField: async () => {}, writeCurrentWorkflowField: async () => {}, writeDesignField: async () => {},
    currentWuReconcile: { prepare: async () => ({ status: "clean", prepared }), apply: async () => { reconciled = true; return { status: "applied", prepared, stagedPaths: [] }; } },
  };
  return { ...h, ctx, meta, state: () => ({ current, head, reconciled, branches: [...branches.keys()] }), read: async () => lifecycleSuccess(await h.store.read({ reference: meta.reference })) };
}
const params = { name: "demo", toBranch: "feat/demo", baseBranch: "main", nextAction: "Begin work" };

describe("store activation", () => {
  it.each([null, "main"])("creates its branch from %s with no exclusions", async (branch) => {
    const h = await harness({ branch });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated", branch: "feat/demo" });
    expect((await h.read()).links?.branches).toEqual([{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }]);
    expect(h.state().current).toBe("feat/demo"); expect(parseMetaRecord((await h.read()).content).state).toBe("Active");
  });
  it("adopts the person's branch and excludes local and remote-only commits", async () => {
    const h = await harness({ branch: "person", commits: [local], remoteHead: remote });
    const result = await runActivate(h.ctx, params);
    expect(result).toMatchObject({ status: "activated", report: expect.arrayContaining([expect.stringContaining(`git merge --ff --no-edit ${remote}`)]) });
    expect((await h.read()).links?.branches).toEqual([{ repository: "repo", ref: "feat/demo", linkedAs: "adopted", excluded: [{ repository: "repo", sha: local }, { repository: "repo", sha: remote }] }]);
    expect(h.state().current).toBe("feat/demo");
    expect(result).not.toHaveProperty("remoteDelete");
  });
  it("refuses a taken work-branch name before reconcile writes", async () => {
    const h = await harness({ branch: "person", taken: true });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("--type") });
    expect(h.state().reconciled).toBe(false); expect((await h.read()).version).toEqual(h.meta.version);
  });
  it("refuses detached commits before reconcile or changing HEAD", async () => {
    const h = await harness({ commits: [local] });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git switch -c <name>") });
    expect(h.state()).toMatchObject({ current: null, head: local, reconciled: false });
    expect((await h.read()).version).toEqual(h.meta.version);
  });
  it("keeps an already correctly named adopted branch", async () => {
    const h = await harness({ branch: "feat/demo", commits: [local] });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated", branch: "feat/demo" });
    expect(h.state().current).toBe("feat/demo"); expect((await h.read()).links?.branches?.[0]?.linkedAs).toBe("adopted");
  });
  it("refuses a branch another work item links before reconciliation", async () => {
    const h = await harness({ branch: "person" });
    await h.seedMeta("other", {}, { kind: "active" }, { branches: [{ repository: "repo", ref: "person", linkedAs: "adopted", excluded: [] }] });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git switch -c <name>") });
    expect(h.state().reconciled).toBe(false); expect((await h.read()).version).toEqual(h.meta.version);
  });
  it("refuses an open Errand's branch, then adopts a separately preserved branch", async () => {
    const h = await harness({ branch: "chore/other" });
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "other" }));
    const errand = await h.seed(reference, transientContent(reference), { kind: "active" },
      { branches: [{ repository: "repo", ref: "chore/other", linkedAs: "created", excluded: [] }] });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git switch -c <name>") });
    expect(h.state()).toMatchObject({ current: "chore/other", reconciled: false });
    expect(await h.read()).toEqual(h.meta);
    expect(lifecycleSuccess(await h.store.read({ reference }))).toEqual(errand);
    await h.ctx.exec!("git", ["switch", "-c", "independent"]);
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated", branch: "feat/demo" });
    expect(h.state().branches).toContain("chore/other");
    expect(lifecycleSuccess(await h.store.read({ reference }))).toEqual(errand);
  });
  it.each(["unreadable", "missed"])("refuses a %s Errand inventory before reconciliation", async (kind) => {
    const h = await harness({ branch: "person" });
    const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "other" }));
    await h.seed(reference, transientContent(reference), { kind: "active" });
    const original = h.store.list.bind(h.store);
    h.store.list = async (input) => {
      const actual = await original(input);
      if (input.kind !== "work-item/record") return actual;
      if (kind === "unreadable") return { status: "ok", result: { status: "unreadable", condition: "Errand inventory unavailable", remedy: { text: "retry peers" } } };
      if (actual.status !== "ok" || actual.result.status !== "complete") throw Error("Expected complete Errand inventory");
      return { status: "ok", result: { ...actual.result, missed: true } };
    };
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected" });
    expect(h.state()).toMatchObject({ current: "person", reconciled: false });
    expect(await h.read()).toEqual(h.meta);
  });
  it("refuses no resolvable base after fetch before reconciliation", async () => {
    const h = await harness({ branch: "person", noBase: true });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git branch main <commit>") });
    expect(h.state().reconciled).toBe(false); expect((await h.read()).version).toEqual(h.meta.version);
  });
  it.each(["unreadable", "missed"])("refuses a %s second listing before reconciliation", async (kind) => {
    const h = await harness({ branch: "person" });
    const original = h.store.list.bind(h.store); let reads = 0;
    h.store.list = async (input) => {
      const actual = await original(input); reads++;
      if (reads !== 2) return actual;
      if (kind === "unreadable") return { status: "ok", result: { status: "unreadable", condition: "Peer inventory unavailable", remedy: { text: "retry peers" } } };
      if (actual.status !== "ok" || actual.result.status !== "complete") throw Error("Expected complete fixture inventory");
      return { status: "ok", result: { ...actual.result, missed: true } };
    };
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected" });
    expect(h.state().reconciled).toBe(false); expect((await h.read()).version).toEqual(h.meta.version);
  });
  it("reports created-link old remote deletion as text when its tip lacks a local copy", async () => {
    const h = await harness({ branch: "plan/demo", commits: [local], remoteHead: remote,
      link: { repository: "repo", ref: "plan/demo", linkedAs: "created", excluded: [{ repository: "repo", sha: remote }] } });
    const result = await runActivate(h.ctx, params);
    expect(result).toMatchObject({ status: "activated", remoteDelete: { text: expect.stringContaining(`git merge --ff --no-edit ${remote}`) } });
    if (result.status !== "activated") return;
    expect(result.remoteDelete).not.toHaveProperty("argv");
  });
  it("reports a typed created-link old remote deletion only after HEAD contains its tip", async () => {
    const h = await harness({ branch: "plan/demo", commits: [local, remote], remoteHead: remote,
      link: { repository: "repo", ref: "plan/demo", linkedAs: "created", excluded: [] } });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated", remoteDelete: { argv: ["git", "push", "origin", "--delete", "plan/demo"] } });
  });
  it("rolls the branch rename back when the version-bound batch refuses", async () => {
    const h = await harness({ branch: "person" });
    const before = await h.read();
    h.store.batch = async () => ({ status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [h.meta.reference], condition: "Changed input", remedy: { text: "retry activation" } } });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
    expect(h.state().current).toBe("person"); expect((await h.read()).version).toEqual(before.version);
  });
  it("reattaches its existing link and adds exclusions for time spent out of Active", async () => {
    const h = await harness({ branch: "feat/demo", commits: [local], link: { repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] } });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated" });
    expect((await h.read()).links?.branches?.[0]).toMatchObject({ ref: "feat/demo", linkedAs: "created", excluded: [{ repository: "repo", sha: local }] });
  });
});

describe("store deactivation", () => {
  it("proceeds with its kept link and a repair report when base does not resolve", async () => {
    const h = await harness({ branch: "feat/demo", link: { repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] } });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated" });
    const actual = h.ctx.exec;
    h.ctx.exec = async (command, args, options) => {
      if (args.includes("rev-parse") && (args.at(-1)?.includes("/main") ?? false)) throw makeGitProcessError({ command, args, exitCode: 1 });
      if (actual === undefined) throw Error("missing exec"); return actual(command, args, options);
    };
    expect(await runDeactivate(h.ctx, { name: "demo", baseBranch: "main" })).toMatchObject({ status: "deactivated", report: expect.arrayContaining([expect.stringContaining("git branch main <commit>")]) });
    expect(h.state().current).toBe("feat/demo");
  });
  it("keeps the work branch and link through deactivation and reactivation", async () => {
    const h = await harness({ branch: "feat/demo", link: { repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] } });
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated" });
    const active = await h.read();
    expect(await runDeactivate(h.ctx, { name: "demo", baseBranch: "main" })).toMatchObject({ status: "deactivated", branch: "feat/demo" });
    expect(h.state().current).toBe("feat/demo"); expect((await h.read()).links).toEqual(active.links);
    expect(parseMetaRecord((await h.read()).content).state).toBe("Planning");
    expect(await runActivate(h.ctx, params)).toMatchObject({ status: "activated", branch: "feat/demo" });
  });
});
