import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { classifyReviewApplicability } from "../../src/scripts/review-gate/core/applicability.js";
import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  projectForwardReviewContract,
  projectReducedForwardReviewContract,
} from "../../src/scripts/review-gate/runtime/forward-contract.js";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const objectId = (character: string): string => character.repeat(40);

async function repositoryFile(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

function contract(options: {
  head: string;
  generation?: number;
  retrigger?: "incremental" | "full-final";
  applicabilityId?: `sha256:${string}` | null;
}) {
  const generation = options.generation ?? 0;
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(options.head),
    headTree: objectId(options.head),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "independent-analysis/v1",
      rubricDigest: canonicalDigest({ rubric: "independent-analysis/v1" }),
      retrigger: options.retrigger ?? "incremental",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected review requirement");
  const request = createReviewRequest(target, {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requirementId: requirement.requirementId,
    carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
    authorIdentity: "author-1",
    evaluatorIdentity: "reviewer-1",
    generation,
    requestMechanism: generation === 0 ? "provider-automatic" : "refresh",
  });
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: options.applicabilityId ?? null,
    reviewRunId: `run-${generation}`,
    evaluatorIdentity: request.evaluatorIdentity,
    attestingRuntimeIdentity: "review-gate-app",
    attestationMechanism: "github-app",
    providerEventIdentity: `review-event-${generation}`,
    result: "clean",
    findings: [],
  });
  return { target, requirement, request, receipt };
}

function applicability(input: {
  priorTargetId: string;
  currentTargetId: string;
  deltaPath: string;
  conflictState?: "none" | "resolved";
}) {
  return classifyReviewApplicability({
    priorTargetId: input.priorTargetId,
    currentTargetId: input.currentTargetId,
    changeSetId: canonicalDigest({ deltaPath: input.deltaPath }),
    reviewedPaths: ["src/reviewed.ts"],
    changeSet: {
      changeSet: "known",
      changes: [{
        status: "modified",
        path: input.deltaPath,
        oldMode: "100644",
        newMode: "100644",
      }],
    },
    conflictState: input.conflictState ?? "none",
  });
}

describe("cross-layer lifecycle and migration proof", () => {
  it("publishes WU and Errand vehicles through one exact-head cycle while cadence controls WU products", async () => {
    const [packagedWorkUnit, projectWorkUnit, packagedErrand, projectErrand] = await Promise.all([
      repositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      repositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      repositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      repositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(projectWorkUnit).toBe(packagedWorkUnit);
    expect(projectErrand).toBe(packagedErrand);

    const candidate = packagedWorkUnit.slice(
      packagedWorkUnit.indexOf("## Phase 2: Compose, sweep, ship"),
      packagedWorkUnit.indexOf("### 13) Behind-base reconcile gate and merge"),
    );
    expect(candidate).toMatch(/`review-settled`[\s\S]*candidate-entry state[\s\S]*never merge readiness/u);
    expect(candidate).toMatch(/`with-integration`[\s\S]*completion content \+ sweep commits \+ ROADMAP regen/u);
    expect(candidate).toMatch(/`manual`[\s\S]*completion content commit only/u);

    const errandPublication = packagedErrand.slice(
      packagedErrand.indexOf("### Ship — full protection"),
      packagedErrand.indexOf("### Ship — partial protection"),
    );
    expect(errandPublication).toMatch(/exact aggregate review target[\s\S]*source-neutral independent-analysis cycle/u);
    expect(errandPublication).toMatch(/`vehicle: errand`[\s\S]*outside WU composition-product requirements/u);
    expect(errandPublication).toMatch(/--match-head-commit \{approved-head-sha\}/u);
    expect(errandPublication).toMatch(/Never invent WU meta or task-list state/u);
  });

  it("carries disjoint coverage, retriggers interaction, requires final-full, and rejects v1 residue", () => {
    const prior = contract({ head: "c" });
    const current = contract({ head: "d", generation: 1 });
    const disjoint = applicability({
      priorTargetId: prior.target.targetId,
      currentTargetId: current.target.targetId,
      deltaPath: "docs/disjoint.md",
    });
    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: prior.request,
      links: [{ fromTargetId: null, ...prior }],
      applicability: disjoint,
      lifecycleTail: null,
      coveragePaths: [],
    })).toMatchObject({
      activeFlight: "invalidated",
      treatment: "carry",
      projection: { conclusion: "success" },
    });

    const interacting = applicability({
      priorTargetId: prior.target.targetId,
      currentTargetId: current.target.targetId,
      deltaPath: "src/reviewed.ts",
    });
    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: current.request,
      links: [{ fromTargetId: null, ...prior }, { fromTargetId: prior.target.targetId, ...current }],
      applicability: interacting,
      lifecycleTail: null,
      coveragePaths: interacting.interactionPaths,
    })).toMatchObject({ treatment: "none", projection: { conclusion: "pending" } });

    const interactionReceipt = createReviewReceipt({
      target: current.target,
      requirement: current.requirement,
      request: current.request,
      applicabilityId: interacting.applicabilityId,
      reviewRunId: "interaction-run",
      evaluatorIdentity: current.request.evaluatorIdentity,
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: "interaction-event",
      result: "clean",
      findings: [],
    });
    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: current.target,
      requirement: current.requirement,
      activeRequest: current.request,
      links: [
        { fromTargetId: null, ...prior },
        { fromTargetId: prior.target.targetId, ...current, receipt: interactionReceipt },
      ],
      applicability: interacting,
      lifecycleTail: null,
      coveragePaths: interacting.interactionPaths,
    })).toMatchObject({ treatment: "incremental", projection: { conclusion: "success" } });

    const final = contract({ head: "e", generation: 2, retrigger: "full-final" });
    expect(projectReducedForwardReviewContract({
      channel: "hosted",
      target: final.target,
      requirement: final.requirement,
      activeRequest: final.request,
      links: [{ fromTargetId: null, ...final }],
      applicability: null,
      lifecycleTail: null,
      coveragePaths: [],
    })).toMatchObject({ treatment: "final-full", projection: { conclusion: "success" } });

    expect(() => projectForwardReviewContract({
      channel: "hosted",
      target: final.target,
      requirement: final.requirement,
      request: final.request,
      receipt: { schemaVersion: 1 },
    })).toThrow();
  });

  it("keeps correction, swept re-entry, exact-head authorization, and cleanup in candidate-tail order", async () => {
    const workflow = await repositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const resume = workflow.slice(workflow.indexOf("#### Resume entry"), workflow.indexOf("### 2) Local diff preflight"));
    expect(resume).toMatch(/open, not merged PR[\s\S]*swept-candidate arm[\s\S]*Step 13/u);
    expect(resume).toContain("first incomplete candidate-tail step");

    const gate = workflow.slice(
      workflow.indexOf("### 13) Behind-base reconcile gate and merge"),
      workflow.indexOf("### 14) Post-merge worktree cleanup"),
    );
    expect(gate).toMatch(/composition correction[\s\S]*Append[\s\S]*never amend[\s\S]*refire the integration-interlock/iu);
    expect(gate).toMatch(/headSha[\s\S]*differs[\s\S]*invalidate the approval/u);
    expect(gate).toMatch(/interacting[\s\S]*returns? to Step 4[\s\S]*recomposes the candidate/u);
    expect(gate).toMatch(/exact candidate-tail diff[\s\S]*not excerpts alone/u);
    expect(gate).toMatch(/--match-head-commit \{approved-head-sha\}/u);

    const cleanup = workflow.slice(workflow.indexOf("### 14) Post-merge worktree cleanup"));
    expect(cleanup).toMatch(/After `arc user close`, run `arc teardown <wu-name>`/u);
    expect(cleanup).toMatch(/post-merge[\s\S]*merged branch[\s\S]*PR has landed/u);
    expect(cleanup).toMatch(/`with-integration`[\s\S]*fully shipped[\s\S]*`manual`[\s\S]*archive/u);
  });

  it("defines release-note rejection classes without excluding shipped public review concepts", async () => {
    const workflow = await repositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const releaseNotes = workflow.slice(
      workflow.indexOf("### 8) Compose Release Notes Entry"),
      workflow.indexOf("### 9) Compose Completion Notes"),
    );
    for (const forbidden of [
      /WU names or slugs/u,
      /task or phase references/u,
      /branches/u,
      /roadmap pointers/u,
      /internal review or provider machinery/u,
      /other internal\s+development jargon/u,
      /planned-but-unshipped work/u,
    ]) expect(releaseNotes).toMatch(forbidden);
    expect(releaseNotes).toContain("Never include WU names or slugs");
    expect(releaseNotes).toMatch(/Publicly supported review concepts and configuration may be\s+named/u);
    expect(releaseNotes).toMatch(/shipped reader\/operator-visible outcomes supported by the exact candidate diff/u);
  });
});
