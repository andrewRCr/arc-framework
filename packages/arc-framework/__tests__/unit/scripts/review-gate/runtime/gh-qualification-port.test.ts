import { describe, expect, it, vi } from "vitest";

import {
  GhQualificationProbePort,
  type QualificationProbeDescriptor,
} from "../../../../../src/scripts/review-gate/runtime/gh-qualification-port.js";
import type { ProcessRunner } from "../../../../../src/scripts/review-gate/runtime/gh-action-port.js";
import { qualificationCell, qualificationScope } from "./qualification-fixtures.js";

function descriptor(): QualificationProbeDescriptor {
  const cell = qualificationCell("coderabbit-label-trigger");
  const {
    rawCheckpointHash: _rawCheckpointHash,
    repositoryId: _repositoryId,
    pullRequestNumber: _pullRequestNumber,
    headSha: _headSha,
    workflowSha: _workflowSha,
    actorIdentity: _actorIdentity,
    ...result
  } = cell;
  void [_rawCheckpointHash, _repositoryId, _pullRequestNumber, _headSha, _workflowSha, _actorIdentity];
  return {
    cellId: cell.cellId,
    result: { ...result, evidenceRef: "https://github.com/o/r/actions/runs/1" },
    evidenceApiPaths: ["repos/o/r/issues/7/comments"],
    dispatch: "reconcile",
  };
}

function runner(scope = qualificationScope()): { process: ProcessRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args.includes("user")) return { stdout: `${scope.expectedActorIdentity}\n` };
    if (args.some((value) => value.includes("/pulls/7"))) return { stdout: `${scope.disposableHeadSha}\n` };
    if (args[1]?.endsWith("/comments") && !args.includes("POST")) return { stdout: '[{"id":1}]' };
    return { stdout: "{}" };
  });
  return { process: { run }, run };
}

describe("developer-authenticated qualification probe port", () => {
  it("performs the assigned trigger, dispatches default-branch reconciliation, and re-queries evidence", async () => {
    const scope = qualificationScope();
    const fake = runner(scope);
    const port = new GhQualificationProbePort(fake.process, [descriptor()]);
    await expect(port.execute("coderabbit-label-trigger", scope)).resolves.toMatchObject({
      result: { cellId: "coderabbit-label-trigger", repositoryId: "100", headSha: scope.disposableHeadSha },
      rawNonSecret: { records: [{ path: "repos/o/r/issues/7/comments", value: [{ id: 1 }] }] },
    });
    expect(fake.run.mock.calls.some(([, args]) => args.includes("labels[]=arc-review-gate"))).toBe(true);
    expect(fake.run.mock.calls.some(([, args]) => args.some((value: string) => value.includes("review-gate.yml/dispatches"))))
      .toBe(true);
  });

  it("rejects wrong dispatch classes, actors, and evidence outside the repository", async () => {
    expect(() => new GhQualificationProbePort(runner().process, [{ ...descriptor(), dispatch: "none" }]))
      .toThrow(/dispatch-mismatch/u);
    const wrongActor = runner({ ...qualificationScope(), expectedActorIdentity: "999" });
    await expect(new GhQualificationProbePort(wrongActor.process, [descriptor()])
      .execute("coderabbit-label-trigger", qualificationScope())).rejects.toThrow(/actor-mismatch/u);
    const outside = descriptor();
    outside.evidenceApiPaths = ["repos/other/repo/issues/7/comments"];
    await expect(new GhQualificationProbePort(runner().process, [outside])
      .execute("coderabbit-label-trigger", qualificationScope())).rejects.toThrow(/outside-repository/u);
  });
});
