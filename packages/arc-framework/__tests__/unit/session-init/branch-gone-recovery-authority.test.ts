/** Recovery retains unresolved checkout authority before considering raw cleanup signals. */
import { expect, it } from "vitest";
import { runBranchGoneRecovery } from "../../../src/lib/session-init/branch-gone-recovery.js";
import { inferBranchGoneRecovery } from "../../../src/lib/session-init/recommended-action.js";
import { CascadeResolutionSchema, SessionInitRecoveryValueSchema, type CascadeResolution } from "../../../src/lib/session-init/branch-gone-cascade.js";
import { DerivedCheckoutRowSchema } from "../../../src/lib/locus/derived-schema.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

const diagnostic = { code: "work-unit-locus-conflict", message: "Work unit 'demo' has multiple marker holders: /wt/one, /wt/two. Inspect and release the stray checkout's claim." };
function row(path: string, unresolved: boolean, administrative: boolean): DerivedCheckoutRow {
  return DerivedCheckoutRowSchema.parse({ kind: unresolved ? "unresolved-checkout" : administrative ? "unmanaged-checkout" : "retired",
    subject: administrative && !unresolved ? null : { kind: "work-unit", key: "demo" },
    checkout: { path, head: "a".repeat(40), branch: `feat/${path.endsWith("one") ? "one" : "two"}`, primary: false, detached: false, folderPresent: true },
    markerGeneration: administrative ? null : "generation", parentCheckoutPath: null, origin: null, identity: null, context: null,
    lifecycleLocation: administrative ? null : "completed", diagnostics: unresolved ? [diagnostic] : [] });
}
function candidates(result: CascadeResolution) {
  return result.kind === "resolved" ? [result.candidate] : "candidates" in result ? result.candidates : [];
}

it.each([
  { name: "landed work unit", administrative: false, merged: true, repairedAction: "removable" },
  { name: "live work unit", administrative: false, merged: false, repairedAction: "switch" },
  { name: "administrative checkout", administrative: true, merged: true, repairedAction: "switch" },
])("preserves unresolved $name rows and repair guidance, then resumes from one healthy holder", async scenario => {
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "worktree") return { stdout: worktreePorcelainZ("worktree /primary\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n") };
    if (args[0] === "status") return { stdout: "" };
    if (args[0] === "cherry") return { stdout: scenario.merged ? "" : `+ ${"d".repeat(40)}\n` };
    throw new Error(`Unexpected Git: ${args.join(" ")}`);
  };
  const entry = (path: string) => ({ worktreePath: path, branch: row(path, false, scenario.administrative).checkout.branch ?? "",
    ...(scenario.administrative ? {} : { workUnit: "demo", metaFilePath: `${path}/meta-demo.md` }) });
  const common = { currentBranch: "feat/gone", baseBranch: "main", recentBranches: [], exec, folderExists: async () => true,
    readMarker: async () => ({ kind: "present" as const, marker: { spawnedByArc: true, wuName: "demo", createdFor: { kind: "work-unit" as const, name: "demo" }, spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00Z" } }),
    userSurfaceFs: { readDir: async () => [], readFile: async () => "", writeFile: async () => {}, mkdir: async () => {} } };
  for (const paths of [["/wt/one", "/wt/two"], ["/wt/one"]]) {
    const result = await runBranchGoneRecovery({ ...common, roster: { entries: paths.map(entry), warnings: [] },
      derivedRoster: paths.map(path => row(path, true, scenario.administrative)) });
    expect(candidates(result)).toHaveLength(paths.length);
    expect(candidates(result).every(candidate => candidate.proposedAction === "external")).toBe(true);
    expect(CascadeResolutionSchema.safeParse(result).success).toBe(true);
    const narration = inferBranchGoneRecovery(result, { state: "clean", fileCount: 0 });
    expect(narration.recommendedAction).not.toBe("switch");
    expect(narration.recommendedPromptText).toContain(diagnostic.message);
    expect(narration.recommendedPromptText).toMatch(/repair.*retry/iu);
    expect(narration.actions?.every(action => action.argv === undefined)).toBe(true);
    expect(SessionInitRecoveryValueSchema.safeParse(narration).success).toBe(true);
  }
  const repaired = await runBranchGoneRecovery({ ...common, roster: { entries: [entry("/wt/one")], warnings: [] },
    derivedRoster: [row("/wt/one", false, scenario.administrative)] });
  expect(repaired).toMatchObject({ kind: "resolved", candidate: { proposedAction: scenario.repairedAction } });
  const narration = inferBranchGoneRecovery(repaired, { state: "clean", fileCount: 0 });
  expect(narration.recommendedAction).toBe(scenario.repairedAction === "removable" ? "prompt" : "switch");
});
