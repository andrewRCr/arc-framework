/** Shared-planner verdicts across GitHub test-merge recomputation and required reconciliation. */

import { describe, expect, it } from "vitest";
import { githubMergeLag } from "../../../helpers/github-merge-lag.js";
import { checkpointDependencies as dependencies } from "../../../helpers/integration-checkpoint.js";
import { checkpointIntegration } from "../../../../src/scripts/integration/checkpoint.js";

const oid = (character: string): string => character.repeat(40);

describe("checkpoint host admission", () => {
  it.each([true, false])("handles disjoint GitHub recomputation (becomes current: %s) without a new head", async (becomesCurrent) => {
    const deps = dependencies();
    const readDrift = deps.readDrift;
    deps.readDrift = async (workUnit) => {
      const drift = await readDrift(workUnit);
      if (drift.verdict !== "clean" && drift.verdict !== "reconcile") throw new Error("expected healthy drift");
      return { ...drift, movement: "disjoint", overlap: { status: "available", substantivePaths: [], regenerablePaths: [] } };
    };
    const host = githubMergeLag({
      repository: "owner/repo", changeRequest: 42, baseRef: "main", base: oid("b"), head: oid("c"),
    }, becomesCurrent);
    deps.readMovementObservation = async () => ({
      feasibility: { state: "clean", base: oid("b"), head: oid("c") },
      admission: await host.observe(),
    });
    const result = await checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps);
    expect(result).toMatchObject(becomesCurrent ? {
      state: "ready", nextAction: "request-approval",
      payload: { movementObservation: { feasibility: { head: oid("c") }, admission: { head: oid("c") } } },
    } : {
      state: "blocked", reason: "host-pending", coordinates: { observedHeadOid: oid("c") },
      detail: expect.stringMatching(/three-read observation limit.*Retry/u),
    });
  });

  it.each([
    ["strict policy", "disjoint", "clean", "base-currentness-required", "base-currentness-required"],
    ["ambiguous ancestry", "unknown", "clean", "mergeable", "ambiguous merge base"],
    ["generated conflict with strict policy", "overlapping", "regenerable-conflict", "base-currentness-required", "regenerable-conflict"],
  ] as const)("names the deciding rule for %s reconciliation", async (_label, movement, feasibility, admission, rule) => {
    const deps = dependencies();
    const readDrift = deps.readDrift;
    deps.readDrift = async (workUnit) => {
      const drift = await readDrift(workUnit);
      if (drift.verdict !== "clean" && drift.verdict !== "reconcile") throw new Error("expected healthy drift");
      return { ...drift, movement, overlap: movement === "unknown" ? { status: "ambiguous" }
        : { status: "available", substantivePaths: movement === "overlapping" ? ["src/index.ts"] : [], regenerablePaths: [] } };
    };
    deps.readMovementObservation = async () => ({
      feasibility: feasibility === "clean" ? { state: feasibility, base: oid("b"), head: oid("c") }
        : { state: feasibility, base: oid("b"), head: oid("c"), paths: ["ROADMAP.md"] },
      admission: admission === "mergeable"
        ? { state: admission, repository: "owner/repo", changeRequest: 42, baseRef: "main", base: oid("b"), head: oid("c") }
        : { state: admission, repository: "owner/repo", changeRequest: 42, baseRef: "main", base: oid("b"), head: oid("c"), detail: "Strict policy." },
    });
    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps)).resolves.toMatchObject({
      state: "reconcile", detail: expect.stringContaining(rule),
    });
  });

});
