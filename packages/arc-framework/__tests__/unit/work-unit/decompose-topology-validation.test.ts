import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  checkCohortConsistency,
  type CohortConsistencyInput,
} from "../../../src/lib/active/cohort-consistency.js";
import {
  validateV3DecomposeTopology,
} from "../../../src/lib/work-unit/decompose-topology-validation.js";
import {
  renderV3IncompleteCohort,
  type V3TopologyTreeState,
} from "../../../src/lib/work-unit/decompose-v3-topology.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const template = readFileSync("arc/reference/templates/arc/work-unit/template-cohort.md");
const topologyPath = ".arc/backlog/planned/origin/cohort-origin.md";

function topologyState(bytes: Uint8Array): Exclude<V3TopologyTreeState, { kind: "absent" }> {
  return { kind: "object", objectKind: "blob", mode: "100644", bytes };
}

function validate(candidateTree: Record<string, Exclude<V3TopologyTreeState, { kind: "absent" }>>) {
  const cohortBytes = candidateTree[topologyPath]?.bytes;
  const cohortConsistency: CohortConsistencyInput = {
    metas: [],
    cohortDocs: cohortBytes === undefined
      ? []
      : [{ path: topologyPath, content: new TextDecoder().decode(cohortBytes) }],
  };
  return validateV3DecomposeTopology({
    preparation: v3DecompositionEvidenceFixture().preparation,
    candidateTree,
    cohortTemplate: template,
    cohortConsistency,
  });
}

function authoredTopology(): Uint8Array {
  const bytes = renderV3IncompleteCohort(template, "origin");
  if (bytes === null) throw new Error("cohort template must render");
  return new TextEncoder().encode(
    new TextDecoder().decode(bytes).replace("**Purpose:** —", "**Purpose:** Coordinate the split."),
  );
}

describe("validateV3DecomposeTopology", () => {
  it("refuses a missing required coordination document at its exact path", () => {
    expect(validate({})).toEqual({
      status: "refused",
      issues: [{
        code: "topology-document-missing",
        path: topologyPath,
      }],
    });
  });

  it("refuses only the exact incomplete Purpose sentinel", () => {
    const bytes = renderV3IncompleteCohort(template, "origin");
    if (bytes === null) throw new Error("cohort template must render");

    expect(validate({ [topologyPath]: topologyState(bytes) })).toEqual({
      status: "refused",
      issues: [{
        code: "topology-purpose-incomplete",
        path: topologyPath,
      }],
    });
  });

  it("accepts an authored Purpose without requiring optional sections", () => {
    expect(validate({ [topologyPath]: topologyState(authoredTopology()) })).toEqual({
      status: "validated",
      topologyPaths: [topologyPath],
    });
  });

  it("refuses candidate layout drift without projecting a replacement path", () => {
    const wrongIdentity = new TextEncoder().encode([
      "# Cohort: `different`",
      "",
      "**Purpose:** Coordinate the split.",
      "",
      "---",
      "",
    ].join("\n"));

    expect(validate({ [topologyPath]: topologyState(wrongIdentity) })).toEqual({
      status: "refused",
      issues: [{
        code: "topology-planner-mismatch",
        path: topologyPath,
        detail: "wrong-structural-identity",
      }],
    });
  });

  it("refuses drift in the stored topology authority without returning new actions", () => {
    const preparation = structuredClone(v3DecompositionEvidenceFixture().preparation);
    const fact = preparation.facts.topology.facts[0];
    if (fact === undefined || fact.kind === "none") throw new Error("fixture must carry a topology path");
    fact.path = ".arc/backlog/planned/drift/cohort-drift.md";

    expect(validateV3DecomposeTopology({
      preparation,
      candidateTree: { [topologyPath]: topologyState(authoredTopology()) },
      cohortTemplate: template,
      cohortConsistency: {
        metas: [],
        cohortDocs: [{
          path: topologyPath,
          content: new TextDecoder().decode(authoredTopology()),
        }],
      },
    })).toEqual({
      status: "refused",
      issues: [{ code: "preparation-invalid" }],
    });
  });

  it("does not apply the decomposition Purpose sentinel floor to unrelated cohorts", () => {
    const authored = authoredTopology();
    const unrelatedPath = ".arc/backlog/planned/unrelated/cohort-unrelated.md";
    const unrelated = renderV3IncompleteCohort(template, "unrelated");
    if (unrelated === null) throw new Error("cohort template must render");

    expect(validateV3DecomposeTopology({
      preparation: v3DecompositionEvidenceFixture().preparation,
      candidateTree: { [topologyPath]: topologyState(authored) },
      cohortTemplate: template,
      cohortConsistency: {
        metas: [],
        cohortDocs: [
          { path: topologyPath, content: new TextDecoder().decode(authored) },
          { path: unrelatedPath, content: new TextDecoder().decode(unrelated) },
        ],
      },
    })).toEqual({
      status: "validated",
      topologyPaths: [topologyPath],
    });
  });

  it("preserves generic cohort-consistency diagnostics for unrelated cohorts", () => {
    const authored = authoredTopology();
    const cohortConsistency: CohortConsistencyInput = {
      metas: [],
      cohortDocs: [{
        path: ".arc/backlog/planned/unrelated/cohort-unrelated.md",
        content: "# Cohort: `unrelated`\n\n---\n",
      }],
      existingCohortDocDirs: new Set(["origin"]),
    };
    const genericDiagnostics = checkCohortConsistency(cohortConsistency);

    expect(validateV3DecomposeTopology({
      preparation: v3DecompositionEvidenceFixture().preparation,
      candidateTree: { [topologyPath]: topologyState(authored) },
      cohortTemplate: template,
      cohortConsistency,
    })).toEqual({
      status: "refused",
      issues: genericDiagnostics.map((detail) => ({ code: "cohort-consistency", detail })),
    });
  });
});
