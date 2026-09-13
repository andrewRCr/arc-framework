import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { workUnitPathTreatmentContext } from "../../src/lib/base-drift/current-adapters.js";
import {
  closeDeliveryEligibility,
  prepareDeliveryEligibility,
} from "../../src/lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../../src/lib/delivery/git-eligibility.js";
import { revalidateDeliveryLifecycleContribution } from
  "../../src/lib/delivery/git-lifecycle-contribution.js";
import {
  bindInitialDeliveryRef,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
} from "../../src/lib/delivery/materialization.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { analyzeRevisionOverlap } from "../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import {
  createCandidateAttestation,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import { readAncestry } from "../../src/lib/work-unit/git-decomposition-object-readers.js";
import {
  deliveryStackPlanFixture,
  deliveryThreeMemberStackPlanForWorkUnitFixture,
} from "../fixtures/delivery-plan.js";
import { checkpointIntegration } from "../../src/scripts/integration/checkpoint.js";
import { createIntegrationCheckpointDependencies } from
  "../../src/scripts/integration/checkpoint-composition.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("disjoint delivery eligibility", () => {
  it("lands a base-only readiness regeneration without its custom merge driver", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-disjoint-" });
    roots.push(repository);
    const git = async (args: readonly string[]): Promise<string> => (
      await execFileAsync("git", [...args], { cwd: repository })
    ).stdout.trim();
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    await mkdir(join(repository, ".arc", "backlog"), { recursive: true });
    await writeFile(join(repository, ".gitattributes"), ".arc/backlog/ROADMAP.md merge=arc-roadmap\n", "utf8");
    await writeFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "base readiness\n", "utf8");
    await git(["add", ".gitattributes", ".arc/backlog/ROADMAP.md"]);
    await git(["commit", "-m", "base readiness"]);
    const chainBase = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "candidate/first"]);
    await writeFile(join(repository, "first.txt"), "reviewed first member\n", "utf8");
    await git(["add", "first.txt"]);
    await git(["commit", "-m", "first member"]);
    const firstHead = await git(["rev-parse", "HEAD"]);
    await git(["switch", "-c", "candidate/top"]);
    await writeFile(join(repository, "top.txt"), "reviewed terminal\n", "utf8");
    await git(["add", "top.txt"]);
    await git(["commit", "-m", "terminal member"]);

    await git(["switch", "main"]);
    await writeFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "advanced readiness\n", "utf8");
    await git(["add", ".arc/backlog/ROADMAP.md"]);
    await git(["commit", "-m", "regenerate readiness"]);
    const observedTip = await git(["rev-parse", "HEAD"]);
    await git(["config", "merge.arc-roadmap.driver", "false"]);

    const plan = deliveryStackPlanFixture();
    const candidates = ["candidate/first", "candidate/top"].map((ref, index) => ({
      deliverableId: plan.members[index]!.deliverableId,
      ref: `refs/heads/${ref}`,
    }));
    const dependencies = {
      observeRef: (ref: string) => observeDeliveryEligibilityRef(exec, ref),
      readAncestry: (ancestor: string, descendant: string) => readAncestry(exec, ancestor, descendant),
      readOverlap: (input: { leftRevision: string; rightRevision: string; workUnitId: string }) => (
        analyzeRevisionOverlap({
          exec,
          leftRevision: input.leftRevision,
          rightRevision: input.rightRevision,
          treatmentContext: workUnitPathTreatmentContext(input.workUnitId),
        })
      ),
      revalidateLifecycleContribution: (input: {
        protectedBaseRef: string;
        chainBaseRef: string;
        candidateRef: string;
        paths: readonly string[];
        regenerablePaths: readonly string[];
      }) => revalidateDeliveryLifecycleContribution({ exec, ...input }),
      compareNormalizedCompleteness: async (input: {
        protectedBase: { ref: string; head: string; tree: string };
        chainBase: { head: string; tree: string };
        top: { ref: string; head: string; tree: string };
        finalCandidate: { deliverableId: string; ref: string; head: string; tree: string };
        lifecyclePaths: readonly string[];
        regenerablePaths: readonly string[];
      }) => {
        const result = await compareGitNormalizedDeliveryTrees({
          exec,
          protectedBaseTree: input.protectedBase.tree,
          chainBaseTree: input.chainBase.tree,
          topTree: input.top.tree,
          finalCandidateTree: input.finalCandidate.tree,
          lifecyclePaths: input.lifecyclePaths,
          regenerablePaths: input.regenerablePaths,
        });
        return result.status === "unavailable"
          ? { status: "refused" as const, reason: "unavailable" as const }
          : result.status === "match"
            ? result
            : { status: "refused" as const, reason: "mismatched" as const };
      },
      readCurrentPlan: async () => plan,
      resolveMember: async () => ({ status: "ok" as const, value: null }),
      inspectCheckout: (path: string) => inspectDeliveryCandidateCheckout(exec, path),
    };

    const prepared = await prepareDeliveryEligibility({
      plan,
      protectedBaseRef: "refs/heads/main",
      topRef: "refs/heads/candidate/top",
      candidates,
      lifecyclePaths: [".arc/backlog/ROADMAP.md"],
    }, dependencies);
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.snapshot).toMatchObject({
      protectedBase: { head: observedTip },
      chainBase: { head: chainBase },
      predecessorRelation: { kind: "disjoint-ahead", observedTip, chainBase },
    });
    await expect(closeDeliveryEligibility(prepared.snapshot, dependencies))
      .resolves.toMatchObject({ status: "eligible" });

    const materialization = deriveDeliveryMaterialization(plan, prepared.snapshot);
    expect(materialization.status).toBe("derived");
    if (materialization.status !== "derived") return;
    expect(materialization.value.target.head).toBe(chainBase);
    expect(materialization.value.members[0]!.coordinates.base).toBe(chainBase);

    const publisher = new RepositoryGitCommonStatePublisher(exec, repository);
    const stateStore = new RepositoryDeliveryStateStore(publisher);
    const refs = {
      observe: async (ref: string) => {
        try {
          return { status: "observed" as const, head: await git(["rev-parse", "--verify", ref]) };
        } catch {
          return { status: "absent" as const };
        }
      },
      publish: async (ref: string, head: string) => {
        await git(["update-ref", ref, head]);
        return { status: "published" as const };
      },
    };
    const bound = await bindInitialDeliveryRef({
      plan, materialization: materialization.value, stateStore, refs,
    });
    expect(bound.status).toBe("bound");
    const materialized = await materializeBoundDeliveryChain({
      plan, materialization: materialization.value, stateStore, refs,
    });
    expect(materialized.status).toBe("materialized");
    if (materialized.status !== "materialized") return;
    expect(materialized.state.value.target?.coordinates?.head).toBe(chainBase);
    expect(materialized.state.value.members[0]?.coordinates?.base).toBe(chainBase);
    expect(await git(["rev-parse", "main"])).toBe(observedTip);

    await git(["merge", "--no-ff", "--no-edit", "refs/heads/candidate/first"]);
    expect(await readFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "utf8"))
      .toBe("advanced readiness\n");
    expect(await readFile(join(repository, "first.txt"), "utf8")).toBe("reviewed first member\n");
    expect(await git(["rev-parse", "refs/heads/candidate/first"])).toBe(firstHead);
  });

  it("advances an unlinked three-member checkpoint past disjoint predecessor landing", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-checkpoint-disjoint-" });
    roots.push(repository);
    const git = async (args: readonly string[]): Promise<string> => (
      await execFileAsync("git", [...args], { cwd: repository })
    ).stdout.trim();
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const coordinate = async (head: string) => ({
      head,
      tree: await git(["rev-parse", `${head}^{tree}`]),
    });

    await mkdir(join(repository, ".arc", "backlog"), { recursive: true });
    await writeFile(join(repository, ".gitattributes"), ".arc/backlog/ROADMAP.md merge=arc-roadmap\n", "utf8");
    await writeFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "base readiness\n", "utf8");
    await git(["add", ".gitattributes", ".arc/backlog/ROADMAP.md"]);
    await git(["commit", "-m", "base readiness"]);
    const chainBase = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "candidate/first"]);
    await writeFile(join(repository, "first.txt"), "reviewed first member\n", "utf8");
    await git(["add", "first.txt"]);
    await git(["commit", "-m", "first member"]);
    const firstHead = await git(["rev-parse", "HEAD"]);
    await git(["switch", "-c", "candidate/second"]);
    await writeFile(join(repository, "second.txt"), "reviewed second member\n", "utf8");
    await git(["add", "second.txt"]);
    await git(["commit", "-m", "second member"]);
    const secondHead = await git(["rev-parse", "HEAD"]);
    await git(["switch", "-c", "candidate/top"]);
    await writeFile(join(repository, "top.txt"), "reviewed terminal member\n", "utf8");
    await git(["add", "top.txt"]);
    await git(["commit", "-m", "terminal member"]);
    const terminalHead = await git(["rev-parse", "HEAD"]);

    const target = await collectGitCandidateTarget({
      cwd: repository,
      name: "example",
      baseBranch: "main",
      baseRevision: chainBase,
      revision: terminalHead,
      exec,
    });
    const record: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: "example",
        subject: target.subject,
        baseRevision: terminalHead,
        attestedBy: "andrew",
        attestedAt: "2026-09-10T16:00:00.000Z",
        verificationEvidenceRef: "tasks-example.md#verification",
      }),
      subject: target.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(repository, "example", record, null);

    const plan = deliveryThreeMemberStackPlanForWorkUnitFixture("example");
    const state = DeliveryStateV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-state/v1",
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
      target: { ref: "refs/heads/main", coordinates: await coordinate(chainBase) },
      members: await Promise.all([
        { base: chainBase, head: firstHead, ref: "refs/heads/candidate/first" },
        { base: firstHead, head: secondHead, ref: "refs/heads/candidate/second" },
        { base: secondHead, head: terminalHead, ref: "refs/heads/candidate/top" },
      ].map(async (member, index) => ({
        deliverableId: plan.members[index]!.deliverableId,
        ref: member.ref,
        changeRequest: null,
        coordinates: { base: member.base, ...await coordinate(member.head) },
      }))),
      activeOperation: null,
      pendingReviewFixVerification: null,
    });
    const publisher = new RepositoryGitCommonStatePublisher(exec, repository);
    const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
    const stateStore = new RepositoryDeliveryStateStore(publisher);
    expect((await planStore.publishCurrent(plan.planId, plan, null)).status).toBe("ok");
    expect((await stateStore.publish(plan.planId, state, 0)).status).toBe("ok");

    await git(["switch", "main"]);
    await writeFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "advanced readiness\n", "utf8");
    await git(["add", ".arc/backlog/ROADMAP.md"]);
    await git(["commit", "-m", "regenerate readiness"]);
    await git(["config", "merge.arc-roadmap.driver", "false"]);
    await git(["merge", "--no-ff", "--no-edit", "refs/heads/candidate/first"]);
    const observedTip = await git(["rev-parse", "HEAD"]);
    await git(["switch", "candidate/top"]);

    const overlap = await analyzeRevisionOverlap({
      exec,
      leftRevision: terminalHead,
      rightRevision: observedTip,
      treatmentContext: workUnitPathTreatmentContext("example"),
    });
    expect(overlap.status).toBe("available");
    if (overlap.status !== "available") return;
    const drift = {
      mode: "authoritative" as const,
      verdict: "reconcile" as const,
      state: "diverged" as const,
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: observedTip,
      headOid: terminalHead,
      movement: "disjoint" as const,
      integrationEvidence: {
        coverage: "complete" as const,
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: overlap.overlap,
      register: null,
    };
    const production = createIntegrationCheckpointDependencies({ cwd: repository, exec });
    await expect(production.classifyDeliveryDrift("example", drift)).resolves.toMatchObject({
      status: "disjoint",
      nextAction: "continue",
      evidence: { baselineRevision: terminalHead, baseRevision: observedTip, mergeBase: firstHead },
    });
    await expect(production.readCandidate("example", observedTip))
      .resolves.not.toMatchObject({ status: "current" });

    const downstreamReads: string[] = [];
    const result = await checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, {
      ...production,
      readDrift: async () => drift,
      readMovementObservation: async () => {
        downstreamReads.push("movement");
        return {
          feasibility: { state: "clean", base: observedTip, head: terminalHead },
          admission: {
            state: "mergeable",
            repository: "owner/repository",
            changeRequest: 43,
            base: observedTip,
            head: terminalHead,
          },
        };
      },
      readLifecycle: async () => {
        downstreamReads.push("lifecycle");
        return {
          workUnit: "example",
          storageVersion: terminalHead,
          archiveCadence: "manual",
          state: "integrating",
          position: { phase: "Integrating", location: "active" },
          artifactFacts: [],
          complete: true,
        };
      },
    });
    expect(result).not.toMatchObject({
      reason: "delivery-terminal-blocked",
      payload: { reason: "drift-classification-unavailable" },
    });
    expect(downstreamReads).toEqual(["movement", "lifecycle"]);
    expect(await git(["rev-parse", "refs/heads/candidate/first"])).toBe(firstHead);
    expect(await git(["rev-parse", "refs/heads/candidate/second"])).toBe(secondHead);
    expect(await git(["rev-parse", "refs/heads/candidate/top"])).toBe(terminalHead);
  });
});
