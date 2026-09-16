/** Planning probe: does an operator-resolved terminal absorption reach a covered applicability decision? */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import type { RawGitExec } from "../../src/lib/change-facts.js";
import { absorbGitDeliveryChain } from "../../src/lib/delivery/chain-absorption.js";
import { proveGitDeliveryContribution } from "../../src/lib/delivery/git-contribution-proof.js";
import { classifyCandidateApplicability } from "../../src/lib/work-unit/candidate-applicability.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  reduceCandidateDurableBaseline,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { projectEffectiveCandidateTarget } from "../../src/lib/work-unit/candidate-effective-target.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

/** Build the conflicted absorption fixture: a top and a refreshed predecessor that collide on one path. */
async function createConflictedFixture() {
  const repository = await createTempRepoCore({ prefix: "arc-probe-terminal-waiver-" });
  roots.push(repository);
  const git = async (args: string[]): Promise<string> => (
    await execFileAsync("git", args, { cwd: repository })
  ).stdout.trim();

  await writeFile(join(repository, "base.txt"), "base\n", "utf8");
  await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
  await git(["add", "base.txt", "shared.txt"]);
  await git(["commit", "-m", "base"]);
  const base = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "member"]);
  await writeFile(join(repository, "member.txt"), "member\n", "utf8");
  await git(["add", "member.txt"]);
  await git(["commit", "-m", "member"]);
  const originalMember = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "feat/example"]);
  await writeFile(join(repository, "residual.txt"), "residual\n", "utf8");
  await writeFile(join(repository, "shared.txt"), "top\n", "utf8");
  await git(["add", "residual.txt", "shared.txt"]);
  await git(["commit", "-m", "top residual"]);
  const top = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "moved-base", base]);
  await writeFile(join(repository, "base-movement.txt"), "landed elsewhere\n", "utf8");
  await writeFile(join(repository, "shared.txt"), "moved base\n", "utf8");
  await git(["add", "base-movement.txt", "shared.txt"]);
  await git(["commit", "-m", "move base"]);
  await git(["switch", "-c", "refreshed-member"]);
  await git(["cherry-pick", originalMember]);
  const refreshedMember = await git(["rev-parse", "HEAD"]);
  await git(["switch", "feat/example"]);

  const exec: RawGitExec = async (args) => {
    const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
    return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
  };
  const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });
  return { repository, git, exec, coordinate, base, originalMember, refreshedMember, top };
}

/** Project a reviewable subject snapshot naming the one colliding path at a revision. */
function subjectAt(marker: string) {
  return createCandidateSubjectSnapshot([{
    path: "shared.txt",
    mode: "100644",
    digest: canonicalDigest({ marker }),
    treatment: "reviewable",
  }]);
}

describe("terminal absorption waiver through Candidate applicability", () => {
  it("adopts an operator-resolved merge, then reaches a covered decision that advances the baseline", async () => {
    const fixture = await createConflictedFixture();
    const topCoordinate = await fixture.coordinate(fixture.top);

    // 1. The mechanical absorption refuses, naming the colliding path.
    const refused = await absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: topCoordinate,
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    });
    expect(refused).toEqual({
      status: "refused",
      reason: "content-conflict",
      paths: ["shared.txt"],
    });

    // 2. The operator resolves it the only way Git offers: merge the refreshed predecessor by hand.
    //    Note the merge base Git picks here is NOT the one the absorption composes against.
    await expect(execFileAsync("git", ["merge", "--no-ff", fixture.refreshedMember], {
      cwd: fixture.repository,
    })).rejects.toThrow();
    await writeFile(join(fixture.repository, "shared.txt"), "operator resolution\n", "utf8");
    await fixture.git(["add", "shared.txt"]);
    await fixture.git(["commit", "--no-edit"]);
    const resolvedHead = await fixture.git(["rev-parse", "HEAD"]);
    const resolvedTree = await fixture.git(["rev-parse", "HEAD^{tree}"]);

    // 3. Re-running the absorption adopts that commit on its parent pair alone — any tree.
    const adopted = await absorbGitDeliveryChain({
      exec: fixture.exec,
      topRef: "refs/heads/feat/example",
      top: topCoordinate,
      previousHighestMember: await fixture.coordinate(fixture.originalMember),
      highestMember: await fixture.coordinate(fixture.refreshedMember),
    });
    expect(adopted).toEqual({ status: "absorbed", head: resolvedHead, tree: resolvedTree });

    // 4. The adopted head does not prove as a mechanical contribution.
    const endpoints = {
      before: {
        predecessor: await fixture.coordinate(fixture.originalMember),
        member: topCoordinate,
      },
      after: {
        predecessor: await fixture.coordinate(fixture.refreshedMember),
        member: { head: resolvedHead, tree: resolvedTree },
      },
    };
    const proof = await proveGitDeliveryContribution({ exec: fixture.exec, ...endpoints });
    expect(proof.status).toBe("refused");

    // 5. Candidate applicability therefore lands in the judgment arm, carrying the paths as disclosure.
    const baselineSubject = subjectAt("top");
    const attestation = createCandidateAttestation({
      workUnit: "example",
      subject: baselineSubject,
      baseRevision: fixture.top,
      attestedBy: "andrew",
      attestedAt: "2026-09-16T12:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    });
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation,
      subject: baselineSubject,
      transitions: [],
      lineageAttestations: [],
    };
    const baseline = reduceCandidateDurableBaseline(record);
    const currentTarget = { revision: resolvedHead, subject: subjectAt("operator resolution") };
    const decision = classifyCandidateApplicability({
      candidateId: baseline.candidateId,
      baselineTarget: baseline.target,
      currentTarget,
      currentBase: fixture.refreshedMember,
    }, { endpoints, proof });
    expect(decision.state).toBe("decision-required");
    if (decision.state !== "decision-required") return;
    expect(decision.nextAction).toBe("request-authority");
    expect(decision.choices).toEqual(["covered", "targeted-check", "changed"]);

    // 6. Selecting `covered` advances the durable baseline — no new lineage root.
    const covered = {
      transitionKind: "applicability-selection" as const,
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      candidateId: baseline.candidateId,
      priorTarget: baseline.target,
      currentTarget,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
      selectedBy: "andrew",
      choice: "covered" as const,
    };
    const accepted = { ...record, transitions: [covered] };
    expect(reduceCandidateDurableBaseline(accepted).target).toEqual(currentTarget);

    // 7. And the Candidate recognizes as current at the resolved head, with no applicability request.
    const projected = await projectEffectiveCandidateTarget({
      record: accepted,
      current: currentTarget,
      currentBase: fixture.refreshedMember,
      projectApplicability: async () => {
        throw new Error("An accepted resolution must not re-request applicability.");
      },
    });
    expect(projected.state).toBe("current");
    if (projected.state !== "current") return;
    expect(projected.recognition).toEqual({ kind: "durable" });
    expect(projected.recognizedTarget.revision).toBe(resolvedHead);
  });
});

describe("recognizing an operator-resolved absorption at the applicability boundary", () => {
  it("carries the absorption's parent pair in Git while reporting the resolution as the residual", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-probe-absorption-shape-" });
    roots.push(repository);
    const git = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const rawExec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };

    // A realistic post-landing shape: the predecessor lands into the base, the top must absorb its
    // refreshed form, and the absorption collides on a path both of them touched.
    await writeFile(join(repository, "shared.txt"), "base\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "base"]);
    const baseZero = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "member"]);
    await writeFile(join(repository, "member.txt"), "member\n", "utf8");
    await git(["add", "member.txt"]);
    await git(["commit", "-m", "member"]);
    const memberZero = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "feat/example"]);
    await writeFile(join(repository, "residual.txt"), "residual\n", "utf8");
    await writeFile(join(repository, "shared.txt"), "top\n", "utf8");
    await git(["add", "residual.txt", "shared.txt"]);
    await git(["commit", "-m", "top"]);
    const topZero = await git(["rev-parse", "HEAD"]);

    // The member lands, and the base moves under it on the same colliding path.
    await git(["switch", "main"]);
    await git(["merge", "--no-ff", "-m", "land member", memberZero]);
    await writeFile(join(repository, "shared.txt"), "moved base\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "-m", "base movement"]);
    const baseOne = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "refreshed-member", baseOne]);
    await writeFile(join(repository, "member.txt"), "member refreshed\n", "utf8");
    await git(["add", "member.txt"]);
    await git(["commit", "-m", "refreshed member"]);
    const memberOne = await git(["rev-parse", "HEAD"]);

    // The operator absorbs it by hand, resolving the collision.
    await git(["switch", "feat/example"]);
    await expect(execFileAsync("git", ["merge", "--no-ff", memberOne], { cwd: repository }))
      .rejects.toThrow();
    await writeFile(join(repository, "shared.txt"), "operator resolution\n", "utf8");
    await git(["add", "shared.txt"]);
    await git(["commit", "--no-edit"]);
    const topOne = await git(["rev-parse", "HEAD"]);

    // A. The absorption shape is recoverable from Git alone, with no record written at settle time.
    const parentLine = await git(["rev-list", "--parents", "-n", "1", topOne]);
    expect(parentLine).toBe(`${topOne} ${topZero} ${memberOne}`);

    // B. What applicability actually reports for that head.
    const subjectFrom = async (revision: string) => {
      const listing = await git(["ls-tree", "-r", "--format=%(path) %(objectname)", revision]);
      const entries = listing.split("\n").filter(Boolean).map((line) => {
        const [path, objectName] = line.split(" ");
        if (path === undefined || objectName === undefined) throw new Error("unreadable tree entry");
        return { path, mode: "100644" as const, digest: canonicalDigest({ objectName }),
          treatment: "reviewable" as const };
      });
      return createCandidateSubjectSnapshot(entries);
    };
    const baselineSubject = await subjectFrom(topZero);
    const attestation = createCandidateAttestation({
      workUnit: "example",
      subject: baselineSubject,
      baseRevision: baseZero,
      attestedBy: "andrew",
      attestedAt: "2026-09-16T12:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    });
    const record = {
      schemaVersion: 1 as const,
      semanticsVersion: "candidate-attestation/v1" as const,
      attestation,
      subject: baselineSubject,
      transitions: [],
      lineageAttestations: [],
    };
    const baseline = reduceCandidateDurableBaseline(record);
    const result = await projectGitCandidateApplicability({
      request: {
        candidateId: baseline.candidateId,
        baselineTarget: { revision: topZero, subject: baselineSubject },
        currentTarget: { revision: topOne, subject: await subjectFrom(topOne) },
        currentBase: baseOne,
      },
      exec: rawExec,
      observeEndpoints: async () => ({ candidateHead: topOne, baseHead: baseOne }),
    });

    // The residual is exactly the operator's resolution — not the whole absorbed predecessor,
    // because the landed predecessor is already in the base the contribution replays onto.
    expect(result.state).toBe("decision-required");
    if (result.state !== "decision-required") return;
    expect(result.nextAction).toBe("request-authority");
    expect(result.paths).toEqual(["shared.txt"]);
    expect(result.choices).toEqual(["covered", "targeted-check", "changed"]);

    // `interaction` rather than `clean-divergence`: the mechanical replay itself conflicted, which is
    // definitionally why an absorption reaches a person at all. Its evidence reduction asks for fresh
    // evidence and offers no judgment, while the Candidate layer above it still offers `covered` — so
    // accepting an absorption is an override of the reduction, not a judgment the reduction invited.
    expect(result.verdict).toBe("interaction");
    expect(result.applicability).toEqual({
      verdict: "fresh",
      residual: null,
      reason: "interaction",
      judgmentRequired: false,
    });
  });
});
