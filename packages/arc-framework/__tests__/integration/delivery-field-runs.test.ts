import { beforeAll, describe, expect, it } from "vitest";

import { createRawGitExec } from "../../src/lib/io-context.js";
import { inspectDeliveryBranch } from "../../src/lib/delivery/from-branch.js";
import { constructDeliveryPlanRevision, validateDeliveryPlanRecord } from "../../src/lib/delivery/plan.js";
import { DeliveryPlanAuthoringInputV1Schema } from "../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  ROLLING_CLOSEOUT_MERGE,
  ROLLING_FIELD_RUN,
  SEVEN_MEMBER_AMBIENT_MERGE,
  SEVEN_MEMBER_FIELD_RUN,
  adjacentFieldSeams,
} from "../fixtures/delivery-field-runs.js";
import { execFileAsync } from "../helpers/integration.js";

const RUNS = [SEVEN_MEMBER_FIELD_RUN, ROLLING_FIELD_RUN] as const;

describe("recorded delivery field runs", () => {
  let repository: string;

  beforeAll(async () => {
    repository = await repositoryRoot();
    await requireCompleteFieldHistory(repository);
  });

  it.each(RUNS)("binds every $workUnitId member to its recorded merge parents", async (run) => {
    for (const member of run.members) {
      const record = await execFileAsync("git", [
        "show", "-s", "--format=%H%n%P", member.mergeCommit,
      ], { cwd: repository });
      expect(record.stdout.trim().split("\n")).toEqual([
        member.mergeCommit,
        `${member.base} ${member.head}`,
      ]);
      await expect(execFileAsync("git", [
        "merge-base", "--is-ancestor", member.base, member.head,
      ], { cwd: repository })).resolves.toBeDefined();
    }
  });

  it.each(RUNS)("replays every $workUnitId landed result as one atomic transition", async (run) => {
    const inspections: { chunkKey: string; result: string | readonly string[] }[] = [];
    for (const member of run.members) {
      const result = await inspectDeliveryBranch({
        exec: createRawGitExec(repository),
        base: member.base,
        head: member.mergeCommit,
      });
      inspections.push({
        chunkKey: member.chunkKey,
        result: result.status === "inspected" ? result.contributionStepIds : result.reason,
      });
    }
    expect(inspections).toEqual(run.members.map((member) => ({
      chunkKey: member.chunkKey,
      result: [member.mergeCommit],
    })));
  });

  it("preserves strict refusals when historical raw-head base merges cannot be proved pure", async () => {
    const cases = [
      [SEVEN_MEMBER_FIELD_RUN, "planning"],
      [SEVEN_MEMBER_FIELD_RUN, "result-plan"],
      [SEVEN_MEMBER_FIELD_RUN, "finalization"],
      [SEVEN_MEMBER_FIELD_RUN, "publication-authority"],
      [SEVEN_MEMBER_FIELD_RUN, "lifecycle-publication"],
      [SEVEN_MEMBER_FIELD_RUN, "legacy-retirement"],
      [ROLLING_FIELD_RUN, "session-wiring"],
    ] as const;
    const inspections: { chunkKey: string; result: string }[] = [];
    for (const [run, chunkKey] of cases) {
      const member = run.members.find((candidate) => candidate.chunkKey === chunkKey);
      if (member === undefined) throw new Error(`expected ${run.workUnitId}/${chunkKey}`);
      const result = await inspectDeliveryBranch({
        exec: createRawGitExec(repository),
        base: member.base,
        head: member.head,
      });
      inspections.push({
        chunkKey: `${run.workUnitId}/${chunkKey}`,
        result: result.status === "inspected" ? "inspected" : result.reason,
      });
    }
    expect(inspections).toEqual([
      { chunkKey: "decompose-transform-integrity/planning", result: "ambient-purity-unproven" },
      { chunkKey: "decompose-transform-integrity/result-plan", result: "ambient-purity-unproven" },
      { chunkKey: "decompose-transform-integrity/finalization", result: "ambient-purity-unproven" },
      { chunkKey: "decompose-transform-integrity/publication-authority", result: "ambient-purity-unproven" },
      { chunkKey: "decompose-transform-integrity/lifecycle-publication", result: "ambient-purity-unproven" },
      { chunkKey: "decompose-transform-integrity/legacy-retirement", result: "ambient-purity-unproven" },
      { chunkKey: "session-locus-model/session-wiring", result: "ambient-purity-unproven" },
    ]);
  });

  it.each(RUNS)("constructs the $workUnitId plan without invented task membership", (run) => {
    const planId = run.workUnitId === "session-locus-model"
      ? "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1"
      : "9cd88752-ef99-4e21-a41f-234bc98f35e0";
    const seams = adjacentFieldSeams(run);
    const authoring = DeliveryPlanAuthoringInputV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      workUnitId: run.workUnitId,
      design: { artifacts: [{ artifactId: `spec-${run.workUnitId}.md` }], elements: [] },
      tasks: { implementation: [], verificationTaskId: "1.1" },
      entry: "from-branch",
      projection: { kind: "stack-to-main" },
      members: run.members.map((member) => ({
        status: "live",
        chunkKey: member.chunkKey,
        title: member.title,
        contract: member.contract,
        taskIds: [],
        designElementIds: [],
        mainlineLandability: "independently-landable",
      })),
      seams,
    });
    const construction = constructDeliveryPlanRevision({
      authoring,
      taskInventory: {
        inventoryDigest: canonicalDigest([]),
        implementation: [],
        verificationTaskId: "1.1",
      },
      designInventory: {
        artifacts: [{
          artifactId: `spec-${run.workUnitId}.md`,
          revisionDigest: canonicalDigest({ workUnitId: run.workUnitId }),
        }],
        elements: [],
      },
      predecessor: null,
      mintPlanId: () => planId,
    });

    expect(construction.status).toBe("constructed");
    if (construction.status !== "constructed") return;
    expect(validateDeliveryPlanRecord(construction.plan).status).toBe("valid");
    expect(construction.plan.members).toHaveLength(run.members.length);
    expect(construction.plan.members.every((member) => member.taskIds.length === 0)).toBe(true);
    for (const seam of seams) {
      const recorded = construction.plan.seams.find((candidate) => candidate.seamKey === seam.seamKey);
      const ownerKey = seam.incidentChunkKeys[1];
      const expectedOwner = construction.plan.members.find((member) => member.chunkKey === ownerKey);
      expect(recorded?.ownerDeliverableId).toBe(expectedOwner?.deliverableId);
    }
  });

  it("refuses the recorded mixed base absorb rather than dropping its authored resolution", async () => {
    const member = SEVEN_MEMBER_FIELD_RUN.members.at(-1);
    if (member === undefined) throw new Error("expected final field member");
    const history = await execFileAsync("git", [
      "rev-list", "--first-parent", `${member.base}..${member.head}`,
    ], { cwd: repository });
    expect(history.stdout.trim().split("\n")).toContain(SEVEN_MEMBER_AMBIENT_MERGE);

    const inspection = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: member.base,
      head: member.head,
    });
    expect(inspection).toEqual({ status: "refused", reason: "ambient-purity-unproven" });
  });

  it("keeps bespoke archival closeout outside the 21-member rolling plan", () => {
    expect(ROLLING_FIELD_RUN.members).toHaveLength(21);
    expect(ROLLING_FIELD_RUN.members.map((member) => member.mergeCommit))
      .not.toContain(ROLLING_CLOSEOUT_MERGE);
  });
});

async function repositoryRoot(): Promise<string> {
  const result = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
  return result.stdout.trim();
}

async function requireCompleteFieldHistory(repository: string): Promise<void> {
  const shallow = await execFileAsync("git", ["rev-parse", "--is-shallow-repository"], { cwd: repository });
  if (shallow.stdout.trim() === "true") {
    throw new Error("Recorded delivery field runs require a full checkout; configure fetch-depth: 0.");
  }
  for (const run of RUNS) {
    const first = run.members[0];
    const last = run.members.at(-1);
    if (first === undefined || last === undefined) throw new Error(`Recorded field run ${run.workUnitId} is empty.`);
    for (const oid of [first.base, last.mergeCommit]) {
      try {
        await execFileAsync("git", ["cat-file", "-e", `${oid}^{commit}`], { cwd: repository });
      } catch {
        throw new Error(
          `Recorded delivery field-run object ${oid} is unavailable; configure fetch-depth: 0.`,
        );
      }
    }
  }
}
