/** Scripted retirement repository over the checked reference backend. */
import { createLifecycleHarness, lifecycleSuccess } from "./lifecycle-harness.js";
import { makeGitProcessError } from "../git-exec-fake.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import type { WritePlacement } from "../../../src/lib/store/placement.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import type { BranchLink } from "../../../src/lib/store/links.js";
import type { TeardownContext } from "../../../src/lib/work-unit/verbs/teardown.js";
import { nodeReconcileWorkUnitWorktreeFs } from "../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import type { GitExecInput } from "../../../src/lib/git/exec.js";
const base = "a".repeat(40), work = "b".repeat(40), errand = "c".repeat(40);
export const retirementLink = (ref = "feat/demo", linkedAs: "created" | "adopted" = "created"): BranchLink => ({ repository: "repo", ref, linkedAs, excluded: [] });
export async function createRetirementHarness(options: { ended?: boolean; state?: "Planning" | "Active" | "Integrating"; placement?: WritePlacement; spawned?: boolean; end?: "abandon" | "decompose" | "archive"; branches?: BranchLink[]; noSnapshot?: boolean; held?: boolean; dirty?: boolean; secondaryOwnWork?: boolean; unlanded?: boolean } = {}) {
  const h = createLifecycleHarness(), end = options.end ?? "abandon", branches = options.branches ?? [retirementLink()];
  const meta = await h.seedMeta("demo", { state: end === "archive" ? "Shipped" : options.state ?? "Active", currentWorkflow: end === "archive" ? null : options.state === "Planning" ? "draft-design" : options.state === "Integrating" ? "integrate-work-unit" : "process-task-loop" }, options.placement ?? (end === "archive" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" }), { branches });
  if (end !== "archive" && options.ended !== false) {
    const reference = recordReferences["lineage/transition"](meta.reference.owner);
    lifecycleSuccess(await h.store.batch({ provenance: { verb: end, lifecycleAction: end }, writes: [
      { action: "put", reference, expected: null, content: writeLineageRecord({ schemaVersion: 2, origin: { name: meta.reference.owner.name, ...(meta.reference.owner.type === "person" || meta.reference.owner.uid === undefined ? {} : { uid: meta.reference.owner.uid }) }, kind: end, successors: end === "abandon" ? [] : [{ name: meta.reference.owner.name }], incoming: [], ...(end === "decompose" ? { outgoing: [] } : {}), ...(options.noSnapshot ? {} : { retiredBranches: branches }) }) },
      { action: "remove", reference: meta.reference, expected: meta.version },
    ] }));
  }
  const refs = new Map<string, string>([["refs/heads/main", base], ["refs/remotes/origin/main", base]]);
  for (const branch of branches) { const oid = branch.ref.startsWith("chore/") ? errand : work; refs.set(`refs/heads/${branch.ref}`, oid); refs.set(`refs/remotes/origin/${branch.ref}`, oid); refs.set(`remote/${branch.ref}`, oid); }
  let current: string | null = options.held ? "feat/demo" : "main"; const mutations: string[][] = [];
  const ctx: TeardownContext = {
    cwd: "/repo", store: h.store, execInput: undefined, projectId: async () => "repo",
    exec: async (_command, args) => {
      const absent = () => { throw makeGitProcessError({ command: "git", args, exitCode: 1 }); };
      if (args[0] === "remote") return { stdout: "origin" };
      if (args[0] === "fetch") return { stdout: "" };
      if (args[0] === "rev-parse") { const ref = (args.at(-1) ?? "").replace(/\^\{commit\}$/u, ""); const oid = refs.get(ref.startsWith("origin/") ? `refs/remotes/${ref}` : ref); return oid === undefined ? absent() : { stdout: oid }; }
      if (args[0] === "worktree" && args[1] === "list") return { stdout: args.includes("-z") ? `worktree /repo\0HEAD ${current === "main" ? base : work}\0${current === null ? "detached" : `branch refs/heads/${current}`}\0\0` : `worktree /repo\nHEAD ${current === "main" ? base : work}\n${current === null ? "detached" : `branch refs/heads/${current}`}\n\n` };
      if (args[0] === "status") return { stdout: options.dirty ? "?? personal.txt\n" : "" };
      if (args[0] === "ls-remote") { const name = (args.at(-1) ?? "").replace("refs/heads/", ""); const oid = refs.get(`remote/${name}`); return { stdout: oid === undefined ? "" : `${oid}\trefs/heads/${name}\n` }; }
      if (args[0] === "cherry") return { stdout: options.unlanded ? `+ ${work}\n` : "" };
      if (args[0] === "rev-list") return { stdout: options.secondaryOwnWork && args.includes(errand) ? errand : "" };
      if (args[0] === "merge-base") return { stdout: "" };
      if (args[0] === "switch") { mutations.push(args); current = args[1] === "--detach" ? null : args[1] ?? null; return { stdout: "" }; }
      if (args[0] === "merge") return { stdout: "" };
      if (args[0] === "update-ref" && args[1] === "-d") { mutations.push(args); refs.delete(args[2] ?? ""); return { stdout: "" }; }
      if (args[0] === "push") { mutations.push(args); const branch = args.find((arg) => arg.startsWith(":refs/heads/"))?.slice(12) ?? args.at(-1) ?? ""; refs.delete(`remote/${branch}`); return { stdout: "" }; }
      throw Error(`unexpected Git ${args.join(" ")}`);
    },
    indexFs: { readdir: async () => { throw Error("no checkout index"); }, readFile: async () => { throw Error("no checkout artifact"); } },
    readBlob: async () => { throw Error("no Git lifecycle proof"); }, chdir: () => { throw Error("primary should not hop"); },
    readMarker: () => Promise.resolve(options.held ? { kind: "present" as const, marker: { spawnedByArc: options.spawned ?? false, wuName: "demo", createdFor: { kind: "work-unit" as const, name: "demo" }, spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00.000Z" } } : { kind: "absent" as const }),
    worktreeFs: { ...nodeReconcileWorkUnitWorktreeFs, directoryExists: () => Promise.resolve(true), removeFile: () => Promise.resolve() },
    withWorkItemLock: (operation) => operation(),
  };
  const execInput: GitExecInput = async (args, commands) => {
    const operations = commands.split("\n").filter((line) => line.startsWith("verify ") || line.startsWith("delete "))
      .map((line) => { const [operation, ref = "", expected = ""] = line.split(" "); return { operation, ref, expected }; });
    for (const operation of operations) {
      if (refs.get(operation.ref) !== operation.expected) throw makeGitProcessError({ command: "git", args, exitCode: 1,
        stderr: `Ref generation changed: ${operation.ref}` });
    }
    for (const operation of operations) if (operation.operation === "delete") refs.delete(operation.ref);
    return "";
  };

  ctx.execInput = execInput;
  return { ...h, meta, ctx, refs, state: () => ({ current, mutations }) };
}
