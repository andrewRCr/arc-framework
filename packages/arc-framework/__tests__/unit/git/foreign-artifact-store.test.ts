/** Branchless and paused store work retains the applicable committed and checkout probes. */
import { expect, it } from "vitest";
import { detectForeignArtifactOverlap, projectInFlightToOverlapRoster } from "../../../src/lib/git/foreign-artifact-detection.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
it("reports a branchless work item's checkout edits by identity without a committed probe", async () => {
  const fake = scriptGitExec([
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: "a".repeat(40) }] },
    { match: ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["status", "--porcelain", "--", "src/app.ts"], responses: [{ stdout: " M src/app.ts\n" }] },
  ]);
  const roster = projectInFlightToOverlapRoster([
    { kind: "work-unit", name: "planning", worktreePath: "/holder", state: "Planning", dependsOn: [], remoteOnly: false },
    { kind: "work-unit", name: "caller", branch: "feat/caller", state: "Active", dependsOn: [], remoteOnly: false },
  ], true);
  const result = await detectForeignArtifactOverlap({ exec: fake.exec, roster,
    targetPaths: ["src/app.ts"], baseBranch: "main", originatingWorktreePath: "/caller", originatingWorkUnitName: "caller" });
  expect(result).toEqual({ overlaps: [{ workItem: "planning", worktreePath: "/holder", matchedPaths: ["src/app.ts"] }] });
});
it("counts paused work through both probes", async () => {
  const fake = scriptGitExec([
    { match: ["rev-parse", "--verify", "main"], responses: [{ stdout: "b".repeat(40) }] },
    { match: ["rev-parse", "--verify", "feat/paused"], responses: [{ stdout: "c".repeat(40) }] },
    { match: { prefix: ["diff"] }, responses: [{ stdout: "src/committed.ts\n" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: "a".repeat(40) }] },
    { match: ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["status", "--porcelain", "--", "src/committed.ts", "src/uncommitted.ts"], responses: [{ stdout: " M src/uncommitted.ts\n" }] },
  ]);
  const roster = projectInFlightToOverlapRoster([
    { kind: "work-unit", branch: "feat/paused", name: "paused", worktreePath: "/holder", state: "Active", scheduling: "paused", dependsOn: [], remoteOnly: false },
    { kind: "work-unit", branch: "feat/caller", name: "caller", state: "Active", dependsOn: [], remoteOnly: false },
  ], true);
  expect(await detectForeignArtifactOverlap({ exec: fake.exec, roster,
    targetPaths: ["src/committed.ts", "src/uncommitted.ts"], baseBranch: "main", originatingWorktreePath: "/caller", originatingWorkUnitName: "caller" })).toMatchObject({ overlaps: [{ workItem: "paused", matchedPaths: ["src/committed.ts", "src/uncommitted.ts"] }] });
});
