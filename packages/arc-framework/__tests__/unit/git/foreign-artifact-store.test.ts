/** Branchless and paused store work retains the applicable committed and checkout probes. */
import { expect, it } from "vitest";
import { detectForeignArtifactOverlap } from "../../../src/lib/git/foreign-artifact-detection.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
it("reports a branchless work item's checkout edits by identity without a committed probe", async () => {
  const fake = scriptGitExec([
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: "a".repeat(40) }] },
    { match: ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["status", "--porcelain", "--", "src/app.ts"], responses: [{ stdout: " M src/app.ts\n" }] },
  ]);
  const result = await detectForeignArtifactOverlap({ exec: fake.exec, roster: { entries: [{ workItem: "planning", name: "planning", metaFilePath: ".arc/active/meta-planning.md", worktreePath: "/holder", state: "Planning" }], warnings: [] },
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
  expect(await detectForeignArtifactOverlap({ exec: fake.exec, roster: { entries: [{ branch: "feat/paused", workItem: "paused", name: "paused", metaFilePath: ".arc/active/meta-paused.md", worktreePath: "/holder", state: "Active", scheduling: "paused" }], warnings: [] },
    targetPaths: ["src/committed.ts", "src/uncommitted.ts"], baseBranch: "main", originatingWorktreePath: "/caller", originatingWorkUnitName: "caller" })).toMatchObject({ overlaps: [{ workItem: "paused", matchedPaths: ["src/committed.ts", "src/uncommitted.ts"] }] });
});
