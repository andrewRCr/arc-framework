/** Git-backed public-review continuation proofs across Candidate-represented commit suffixes. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { projectGitDeliveryTerminalCoordinateAdvance } from
  "../../src/lib/delivery/public-review-continuation-git.js";
import { collectGitCandidateTarget } from
  "../../src/lib/work-unit/git-candidate-subject.js";
import type { CandidateEffectiveCurrentProjection } from
  "../../src/lib/work-unit/candidate-effective-target.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function git(root: string, args: string[]): Promise<string> {
  return (await makeGitExec(root)("git", args, { cwd: root })).stdout.trim();
}

describe("delivery public-review continuation Git proof", () => {
  it("preserves a state-bound terminal coordinate below a Candidate-represented commit suffix", async () => {
    const cwd = await createTempRepo("arc-delivery-public-review-continuation-");
    roots.push(cwd);
    const exec = makeGitExec(cwd);
    await mkdir(join(cwd, ".arc", "system", ".internal", "candidates"), { recursive: true });
    await mkdir(join(cwd, ".arc", "active"), { recursive: true });
    await writeFile(join(cwd, "README.md"), "base\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "base"]);
    const baseHead = await git(cwd, ["rev-parse", "HEAD"]);
    await writeFile(join(cwd, "implementation.ts"), "export const value = 1;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "candidate baseline"]);
    const baselineHead = await git(cwd, ["rev-parse", "HEAD"]);

    await writeFile(
      join(cwd, ".arc", "system", ".internal", "candidates", "example.boundary.json"),
      "{}\n",
      "utf8",
    );
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "record boundary"]);
    const stateHead = await git(cwd, ["rev-parse", "HEAD"]);
    const stateTree = await git(cwd, ["rev-parse", "HEAD^{tree}"]);

    await writeFile(join(cwd, ".arc", "active", "tasks-example.md"), "# Tasks\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "record task closure"]);
    const currentHead = await git(cwd, ["rev-parse", "HEAD"]);

    const [baseline, current] = await Promise.all([
      collectGitCandidateTarget({
        cwd,
        name: "example",
        baseBranch: "main",
        baseRevision: baseHead,
        revision: baselineHead,
        exec,
      }),
      collectGitCandidateTarget({
        cwd,
        name: "example",
        baseBranch: "main",
        baseRevision: baseHead,
        revision: currentHead,
        exec,
      }),
    ]);
    const candidate: CandidateEffectiveCurrentProjection = {
      schemaVersion: 1,
      mode: "candidate-effective-target",
      state: "current",
      nextAction: "continue",
      candidateId: `sha256:${"a".repeat(64)}`,
      durableBaselineTarget: { ...baseline, subject: current.subject },
      recognizedTarget: current,
      recognition: { kind: "durable" },
      implementationChanged: false,
      convergenceVerification: "satisfied",
    };

    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate,
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: stateHead, tree: stateTree },
    })).resolves.toMatchObject({
      priorHead: baselineHead,
      currentHead: stateHead,
      currentTree: stateTree,
      proof: "subject-equality",
    });

    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate,
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: stateHead, tree: "f".repeat(40) },
    })).resolves.toBeUndefined();

    await git(cwd, ["checkout", "-b", "unrelated-terminal", baseHead]);
    await writeFile(join(cwd, "unrelated.txt"), "unrelated\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "unrelated terminal"]);
    const unrelatedHead = await git(cwd, ["rev-parse", "HEAD"]);
    const unrelatedTree = await git(cwd, ["rev-parse", "HEAD^{tree}"]);
    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate,
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: unrelatedHead, tree: unrelatedTree },
    })).resolves.toBeUndefined();

    await git(cwd, ["checkout", "-b", "changed-terminal", baselineHead]);
    await writeFile(join(cwd, "implementation.ts"), "export const value = 2;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "change candidate subject"]);
    const changedHead = await git(cwd, ["rev-parse", "HEAD"]);
    const changedTree = await git(cwd, ["rev-parse", "HEAD^{tree}"]);
    await mkdir(join(cwd, ".arc", "system", ".internal", "candidates"), { recursive: true });
    await writeFile(
      join(cwd, ".arc", "system", ".internal", "candidates", "example.boundary.json"),
      "{\"changed\":true}\n",
      "utf8",
    );
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "record changed candidate"]);
    const changedCurrent = await collectGitCandidateTarget({
      cwd,
      name: "example",
      baseBranch: "main",
      baseRevision: baseHead,
      revision: await git(cwd, ["rev-parse", "HEAD"]),
      exec,
    });
    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate: {
        ...candidate,
        durableBaselineTarget: { ...baseline, subject: changedCurrent.subject },
        recognizedTarget: changedCurrent,
      },
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: changedHead, tree: changedTree },
    })).resolves.toBeUndefined();
  });
});
