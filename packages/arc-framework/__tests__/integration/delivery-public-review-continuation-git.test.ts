/** Git-backed public-review continuation proofs across Candidate-represented commit suffixes. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  projectGitDeliveryTerminalCoordinateAdvance,
  projectGitDeliveryTerminalRecordAdvance,
} from "../../src/lib/delivery/public-review-continuation-git.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
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
  it("proves no advance over a history whose subject cannot be collected", async () => {
    const cwd = await createTempRepo("arc-delivery-public-review-ambiguous-");
    roots.push(cwd);
    const exec = makeGitExec(cwd);
    await writeFile(join(cwd, "README.md"), "base\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "base"]);

    // Two merges of the same pair in opposite parent orders, so the terminal and its base share two best
    // common ancestors and no subject can be collected against either.
    await git(cwd, ["switch", "-c", "feat/example"]);
    await writeFile(join(cwd, "branch.ts"), "export const branch = 1;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "branch side"]);
    const branchSide = await git(cwd, ["rev-parse", "HEAD"]);
    await git(cwd, ["switch", "main"]);
    await writeFile(join(cwd, "base.ts"), "export const base = 1;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "base side"]);
    const baseSide = await git(cwd, ["rev-parse", "HEAD"]);
    await git(cwd, ["switch", "feat/example"]);
    await git(cwd, ["merge", "--no-ff", "-m", "branch merge", baseSide]);
    const priorHead = await git(cwd, ["rev-parse", "HEAD"]);
    await git(cwd, ["switch", "main"]);
    await git(cwd, ["merge", "--no-ff", "-m", "base merge", branchSide]);
    await git(cwd, ["switch", "feat/example"]);
    await writeFile(join(cwd, "record.ts"), "export const record = 1;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "operational record"]);
    const currentHead = await git(cwd, ["rev-parse", "HEAD"]);

    // The proof is carried or it is absent; there is no slot on it for why one could not be established,
    // and a movement nothing proves is exactly a movement that keeps no public review.
    await expect(projectGitDeliveryTerminalRecordAdvance({
      cwd,
      exec,
      workUnitId: "example",
      baseBranch: "main",
      priorHead,
      currentHead,
    })).resolves.toBeUndefined();
  });

  it("preserves a state anchor at or below a freshly attested Candidate root", async () => {
    const cwd = await createTempRepo("arc-delivery-public-review-reroot-");
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
    await git(cwd, ["commit", "-m", "delivery state terminal"]);
    const stateHead = await git(cwd, ["rev-parse", "HEAD"]);
    const stateTree = await git(cwd, ["rev-parse", "HEAD^{tree}"]);

    await writeFile(join(cwd, ".arc", "active", "tasks-example.md"), "# Closed tasks\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "fresh Candidate root"]);
    const baselineHead = await git(cwd, ["rev-parse", "HEAD"]);
    const baselineTree = await git(cwd, ["rev-parse", "HEAD^{tree}"]);

    await writeFile(
      join(cwd, ".arc", "system", ".internal", "candidates", "example.json"),
      "{}\n",
      "utf8",
    );
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "record Candidate"]);
    const currentHead = await git(cwd, ["rev-parse", "HEAD"]);
    const [baseline, current] = await Promise.all([
      collectCandidateSubjectTarget({
        cwd,
        name: "example",
        baseBranch: "main",
        baseRevision: baseHead,
        revision: baselineHead,
        exec,
      }),
      collectCandidateSubjectTarget({
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
      durableBaselineTarget: baseline,
      recognizedTarget: current,
      recognition: {
        kind: "machine",
        proof: "subject-equality",
        projectionDigest: `sha256:${"b".repeat(64)}`,
        residualDigest: `sha256:${"c".repeat(64)}`,
      },
      implementationChanged: false,
      convergenceVerification: "satisfied",
      convergenceScope: null,
    };

    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate,
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: stateHead, tree: stateTree },
    })).resolves.toMatchObject({
      priorHead: stateHead,
      priorTree: stateTree,
      currentHead,
      proof: "subject-equality",
    });

    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate,
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: baselineHead, tree: baselineTree },
    })).resolves.toMatchObject({
      priorHead: baselineHead,
      priorTree: baselineTree,
      currentHead,
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

    await git(cwd, ["checkout", "-b", "unrelated-state", baseHead]);
    await writeFile(join(cwd, "unrelated.txt"), "unrelated\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "unrelated state"]);
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
  });

  it("produces no advance proof for an operator-absorbed top the Candidate does not reach", async () => {
    const cwd = await createTempRepo("arc-delivery-public-review-absorbed-");
    roots.push(cwd);
    const exec = makeGitExec(cwd);
    await mkdir(join(cwd, ".arc", "system", ".internal", "candidates"), { recursive: true });
    await mkdir(join(cwd, ".arc", "active"), { recursive: true });
    await writeFile(join(cwd, "README.md"), "base\n", "utf8");
    await writeFile(join(cwd, "shared.txt"), "base\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "base"]);
    const baseHead = await git(cwd, ["rev-parse", "HEAD"]);

    await writeFile(join(cwd, "implementation.ts"), "export const value = 1;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "candidate baseline"]);
    const baselineHead = await git(cwd, ["rev-parse", "HEAD"]);
    await writeFile(join(cwd, "implementation.ts"), "export const value = 2;\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "candidate current"]);
    const currentHead = await git(cwd, ["rev-parse", "HEAD"]);

    // The delivery top line runs beside the work unit's own branch: a prior top and a refreshed
    // member that touch the same path, which is the collision an absorption has to resolve.
    await git(cwd, ["checkout", "-b", "prior-top", baseHead]);
    await writeFile(join(cwd, "shared.txt"), "top side\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "prior top"]);
    const priorTop = await git(cwd, ["rev-parse", "HEAD"]);
    await git(cwd, ["checkout", "-b", "refreshed-member", baseHead]);
    await writeFile(join(cwd, "shared.txt"), "member side\n", "utf8");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-m", "refreshed member"]);
    const refreshedMember = await git(cwd, ["rev-parse", "HEAD"]);

    // The operator resolves it by hand and commits the merge, which is the shape the settlement
    // adopts on its parent pair alone.
    await git(cwd, ["checkout", "prior-top"]);
    await writeFile(join(cwd, "shared.txt"), "resolved by hand\n", "utf8");
    await git(cwd, ["add", "."]);
    const resolvedTree = await git(cwd, ["write-tree"]);
    const absorbedTop = await git(cwd, [
      "commit-tree", resolvedTree, "-p", priorTop, "-p", refreshedMember, "-m", "absorb refreshed member",
    ]);
    // `write-tree` reads the index and leaves the resolution in the worktree; the commit object is
    // already written, so discard it rather than carrying it onto the branch under test.
    await git(cwd, ["checkout", "-f", "main"]);

    // It is genuinely an absorption rather than a replay: the recorded parent pair, and a tree that
    // is neither parent's because a person chose its content.
    expect(await git(cwd, ["rev-list", "--parents", "-n", "1", absorbedTop]))
      .toBe(`${absorbedTop} ${priorTop} ${refreshedMember}`);
    expect(resolvedTree).not.toBe(await git(cwd, ["rev-parse", `${priorTop}^{tree}`]));
    expect(resolvedTree).not.toBe(await git(cwd, ["rev-parse", `${refreshedMember}^{tree}`]));

    const [baseline, current] = await Promise.all([
      collectCandidateSubjectTarget({
        cwd, name: "example", baseBranch: "main", baseRevision: baseHead, revision: baselineHead, exec,
      }),
      collectCandidateSubjectTarget({
        cwd, name: "example", baseBranch: "main", baseRevision: baseHead, revision: currentHead, exec,
      }),
    ]);
    const candidate: CandidateEffectiveCurrentProjection = {
      schemaVersion: 1,
      mode: "candidate-effective-target",
      state: "current",
      nextAction: "continue",
      candidateId: `sha256:${"a".repeat(64)}`,
      durableBaselineTarget: baseline,
      recognizedTarget: current,
      recognition: {
        kind: "machine",
        proof: "subject-equality",
        projectionDigest: `sha256:${"b".repeat(64)}`,
        residualDigest: `sha256:${"c".repeat(64)}`,
      },
      implementationChanged: false,
      convergenceVerification: "satisfied",
      convergenceScope: null,
    };

    // The terminal coordinate records the absorbed top exactly, so the recorded-tree check cannot
    // catch it. What withholds the proof is that the Candidate's recognized target does not reach
    // this commit — which is what leaves the public-review continuation unable to read current.
    await expect(projectGitDeliveryTerminalCoordinateAdvance({
      cwd,
      exec,
      candidate,
      workUnitId: "example",
      baseBranch: "main",
      terminalCoordinates: { base: baseHead, head: absorbedTop, tree: resolvedTree },
    })).resolves.toBeUndefined();
  });

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
      collectCandidateSubjectTarget({
        cwd,
        name: "example",
        baseBranch: "main",
        baseRevision: baseHead,
        revision: baselineHead,
        exec,
      }),
      collectCandidateSubjectTarget({
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
      convergenceScope: null,
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
    const changedCurrent = await collectCandidateSubjectTarget({
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
