import { describe, expect, it, vi } from "vitest";

import { hashContent } from "../../../../../src/lib/manifest/hash.js";
import { QUALIFICATION_CELL_IDS, type QualificationCheckpoint } from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";
import { runQualification } from "../../../../../src/scripts/review-gate/runtime/qualification-runner.js";
import { qualificationCell, qualificationScope } from "./qualification-fixtures.js";

function harness(failAt: string | null = null) {
  const scope = qualificationScope();
  let checkpoint: QualificationCheckpoint | null = null;
  const execute = vi.fn(async (cellId: typeof QUALIFICATION_CELL_IDS[number], observedScope = scope) => {
    expect(observedScope).toBe(scope);
    if (cellId === failAt) throw new Error("raw failure credential-secret");
    const { rawCheckpointHash, ...result } = qualificationCell(cellId);
    expect(rawCheckpointHash).toMatch(/^[a-f0-9]{64}$/u);
    return { result, rawNonSecret: { cellId, observed: true } };
  });
  const restoreSafeCheckpoint = vi.fn(async () => undefined);
  const save = vi.fn(async (value: QualificationCheckpoint) => { checkpoint = value; });
  return {
    scope,
    execute,
    restoreSafeCheckpoint,
    save,
    get checkpoint() { return checkpoint; },
    input: {
      scope,
      inspectWorkspace: async () => ({
        clean: true,
        branch: "main",
        headSha: scope.defaultBranchSha,
        remoteDefaultBranch: "main",
        remoteDefaultSha: scope.defaultBranchSha,
        actorIdentity: scope.expectedActorIdentity,
      }),
      checkpoints: { load: async () => checkpoint, save },
      raw: { write: async (_cellId: string, raw: unknown) => hashContent(JSON.stringify(raw)) },
      probes: { execute, restoreSafeCheckpoint },
    },
  };
}

describe("qualification coordinator", () => {
  it("executes and checkpoints the complete matrix", async () => {
    const target = harness();
    await expect(runQualification(target.input)).resolves.toMatchObject({ status: "qualified" });
    expect(target.execute).toHaveBeenCalledTimes(QUALIFICATION_CELL_IDS.length);
    expect(target.save).toHaveBeenCalledTimes(QUALIFICATION_CELL_IDS.length);
  });

  it("resumes an exact prefix without repeating completed cells", async () => {
    const target = harness();
    const first = await target.input.probes.execute("pending-first", target.scope);
    const hash = await target.input.raw.write("pending-first", first.rawNonSecret);
    const { createQualificationCheckpoint, appendQualificationCell } = await import(
      "../../../../../src/scripts/review-gate/runtime/qualification-contract.js"
    );
    await target.input.checkpoints.save(appendQualificationCell(
      target.scope,
      createQualificationCheckpoint(target.scope),
      { ...first.result, rawCheckpointHash: hash },
    ));
    target.execute.mockClear();
    await expect(runQualification({ ...target.input, resume: true })).resolves.toMatchObject({ status: "qualified" });
    expect(target.execute).not.toHaveBeenCalledWith("pending-first", target.scope);
    expect(target.execute).toHaveBeenCalledTimes(QUALIFICATION_CELL_IDS.length - 1);
  });

  it("restores, blocks the failed tail, and returns only a sanitized refusal", async () => {
    const target = harness("coderabbit-label-trigger");
    const result = await runQualification(target.input);
    expect(result).toEqual({
      status: "refused",
      cellId: "coderabbit-label-trigger",
      reason: "live-cell-failed-or-contaminated",
      repairDirective: "separate-work-unit",
    });
    expect(target.restoreSafeCheckpoint).toHaveBeenCalledWith("coderabbit-label-trigger");
    target.execute.mockClear();
    await expect(runQualification(target.input)).resolves.toMatchObject({
      status: "refused", reason: "checkpoint-exists-resume-required",
    });
    expect(target.execute).not.toHaveBeenCalled();
  });

  it("requires explicit resume whenever a private checkpoint already exists", async () => {
    const target = harness();
    const first = await target.input.probes.execute("pending-first", target.scope);
    const hash = await target.input.raw.write("pending-first", first.rawNonSecret);
    const { createQualificationCheckpoint, appendQualificationCell } = await import(
      "../../../../../src/scripts/review-gate/runtime/qualification-contract.js"
    );
    await target.input.checkpoints.save(appendQualificationCell(
      target.scope,
      createQualificationCheckpoint(target.scope),
      { ...first.result, rawCheckpointHash: hash },
    ));
    target.execute.mockClear();
    await expect(runQualification(target.input)).resolves.toMatchObject({
      status: "refused", reason: "checkpoint-exists-resume-required",
    });
    expect(target.execute).not.toHaveBeenCalled();
  });

  it("refuses an explicit resume when its private checkpoint is missing", async () => {
    const target = harness();
    await expect(runQualification({ ...target.input, resume: true })).resolves.toMatchObject({
      status: "refused", reason: "resume-checkpoint-missing",
    });
    expect(target.execute).not.toHaveBeenCalled();
  });

  it("persists a sanitized block when safe-checkpoint restoration also fails", async () => {
    const target = harness("coderabbit-label-trigger");
    target.restoreSafeCheckpoint.mockRejectedValueOnce(new Error("credential-secret"));
    await expect(runQualification(target.input)).resolves.toMatchObject({
      status: "refused", reason: "safe-checkpoint-restore-failed",
    });
    expect(target.checkpoint).toMatchObject({ blockedReason: "safe-checkpoint-restore-failed" });
  });

  it.each([
    ["dirty checkout", { clean: false }, "dirty-checkout"],
    ["changed default branch", { remoteDefaultSha: "f".repeat(40) }, "default-branch-sha-mismatch"],
    ["wrong actor", { actorIdentity: "999" }, "actor-mismatch"],
  ])("refuses %s before executing probes", async (_name, overrides, reason) => {
    const target = harness();
    target.input.inspectWorkspace = async () => ({
      clean: true,
      branch: "main",
      headSha: target.scope.defaultBranchSha,
      remoteDefaultBranch: "main",
      remoteDefaultSha: target.scope.defaultBranchSha,
      actorIdentity: target.scope.expectedActorIdentity,
      ...overrides,
    });
    await expect(runQualification(target.input)).resolves.toMatchObject({ status: "refused", reason });
    expect(target.execute).not.toHaveBeenCalled();
  });

  it("blocks the remaining tail when the remote default branch changes between cells", async () => {
    const target = harness();
    let inspections = 0;
    target.input.inspectWorkspace = async () => {
      inspections += 1;
      return {
        clean: true,
        branch: "main",
        headSha: target.scope.defaultBranchSha,
        remoteDefaultBranch: "main",
        remoteDefaultSha: inspections < 3 ? target.scope.defaultBranchSha : "f".repeat(40),
        actorIdentity: target.scope.expectedActorIdentity,
      };
    };
    await expect(runQualification(target.input)).resolves.toMatchObject({
      status: "refused", cellId: "coderabbit-label-trigger",
    });
    expect(target.execute).toHaveBeenCalledTimes(1);
    expect(target.checkpoint).toMatchObject({ blockedCell: "coderabbit-label-trigger" });
  });
});
