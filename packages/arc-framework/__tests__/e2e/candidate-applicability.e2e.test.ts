/** Real-CLI coverage for exact-bound Candidate applicability selection and replay. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRawGitExec, gitExec } from "../../src/lib/io-context.js";
import { reduceCandidateDurableBaseline } from "../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecordVersioned } from "../../src/lib/work-unit/candidate-record-store.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcWithStdin,
} from "./helpers.js";

const META = [
  "# Metadata: example",
  "",
  "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
  "| --- | --- | --- | --- | --- |",
  "| `Active` | `test-user` | `feat/example` | `Light` | `P2` |",
  "",
  "- **Cohort:** [none]",
  "- **Depends On:** [none]",
  "- **Origin:** [internal]",
  "- **Design:** [none]",
  "- **Task List:** `tasks-example.md`",
  "- **Review Rubric:** [none]",
  "- **Current Workflow:** [none]",
  "- **Last Completed:** verification",
  "- **Next Task:** [none]",
  "- **Blockers:** [none]",
  "- **Next Action:** verification complete",
  "- **PR URL:** [none]",
  "- **Completed:** [none]",
  "",
  "---",
  "",
].join("\n");

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => cleanupTempDir(root)));
});

describe("arc candidate applicability resolve", () => {
  it("binds one fresh bounded selection and replays it without a duplicate transition", async () => {
    const root = await createTempRepo("arc-candidate-applicability-");
    roots.push(root);
    const initialized = await runArc(["init", "--yes", "--name", "example"], root);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await writeFile(join(root, "reviewed.txt"), "base\n", "utf8");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "install ARC"]);
    const localBase = await git(root, ["rev-parse", "main^{commit}"]);

    await git(root, ["switch", "-c", "feat/example"]);
    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await writeFile(join(root, ".arc", "active", "meta-example.md"), META, "utf8");
    await writeFile(
      join(root, ".arc", "active", "tasks-example.md"),
      "# Task List: Example\n\n- [x] Verification complete\n",
      "utf8",
    );
    await writeFile(join(root, "reviewed.txt"), "feature\n", "utf8");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "feature implementation"]);
    const attested = await runArc(["attest", "example", "--json"], root);
    expect(attested.exitCode, attested.stderr || attested.stdout).toBe(0);
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "record candidate"]);

    await git(root, ["switch", "main"]);
    await writeFile(join(root, "reviewed.txt"), "base moved\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "move base"]);
    const currentBase = await git(root, ["rev-parse", "HEAD^{commit}"]);
    await git(root, ["switch", "feat/example"]);
    await git(root, ["update-ref", "refs/remotes/origin/main", currentBase]);
    await git(root, ["branch", "-f", "main", localBase]);
    await expect(git(root, ["merge", "--no-ff", currentBase, "-m", "merge base"])).rejects.toThrow();
    await writeFile(join(root, "reviewed.txt"), "base moved and feature\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "--no-edit"]);

    const versioned = await readCandidateRecordVersioned(root, "example");
    if (versioned.record === null || versioned.version === null) throw new Error("missing Candidate record");
    const baseline = reduceCandidateDurableBaseline(versioned.record);
    const currentTarget = await collectGitCandidateTarget({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec: gitExec,
    });
    expect(await git(root, ["rev-parse", "main^{commit}"])).toBe(localBase);
    expect(await git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"])).toBe(currentBase);
    const decision = await projectGitCandidateApplicability({
      request: {
        candidateId: baseline.candidateId,
        baselineTarget: baseline.target,
        currentTarget,
        currentBase,
      },
      exec: createRawGitExec(root),
      observeEndpoints: async () => ({
        candidateHead: await git(root, ["rev-parse", "HEAD^{commit}"]),
        baseHead: await git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"]),
      }),
    });
    expect(decision.state).toBe("decision-required");
    if (decision.state !== "decision-required") throw new Error("expected a bounded applicability decision");
    const request = {
      schemaVersion: 1,
      expectedRecordVersion: versioned.version,
      candidateId: baseline.candidateId,
      priorTarget: baseline.target,
      currentTarget,
      currentBase,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
      selectedBy: "test-user",
      choice: "covered",
    };

    const first = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(request)}\n`,
    );
    expect(first.exitCode, first.stderr || first.stdout).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ state: "resolved", nextAction: "commit-selection" });
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe(
      ".arc/system/.internal/candidates/example.json",
    );

    const replay = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(request)}\n`,
    );
    expect(replay.exitCode, replay.stderr || replay.stdout).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ state: "exact-replay", nextAction: "commit-selection" });
    expect((await readCandidateRecordVersioned(root, "example")).record?.transitions).toHaveLength(1);
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe(
      ".arc/system/.internal/candidates/example.json",
    );

    await git(root, ["commit", "-m", "record applicability selection"]);
    const committedReplay = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(request)}\n`,
    );
    expect(committedReplay.exitCode, committedReplay.stderr || committedReplay.stdout).toBe(0);
    expect(JSON.parse(committedReplay.stdout)).toMatchObject({ state: "exact-replay", nextAction: "continue" });
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("");
  }, 60_000);
});
