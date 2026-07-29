import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  projectV3CandidateAuthority,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import {
  planV3DecomposeTopology,
  renderV3IncompleteCohort,
  v3CohortDocumentPath,
  type V3TopologyPlan,
  type V3TopologyTreeState,
} from "../../../src/lib/work-unit/decompose-v3-topology.js";
import { parseV3DecomposeContinuationInput } from "../../../src/lib/work-unit/decompose-v3-receipt.js";
import type { V3DecomposeCutMap } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const template = readFileSync("arc/reference/templates/arc/work-unit/template-cohort.md");

function map(): V3DecomposeCutMap {
  return structuredClone(v3DecompositionEvidenceFixture().preparation.facts.completedMap);
}

function file(bytes: Uint8Array): Exclude<V3TopologyTreeState, { kind: "absent" }> {
  return { kind: "object", objectKind: "blob", mode: "100644", bytes };
}

function plan(
  value: V3DecomposeCutMap,
  baseTree: Record<string, Exclude<V3TopologyTreeState, { kind: "absent" }>> = {},
): V3TopologyPlan {
  const result = planV3DecomposeTopology({
    origin: value.machine.source.origin,
    placement: value.authoring.placement,
    destinations: value.authoring.destinations,
    baseTree,
    cohortTemplate: template,
  });
  if (result.status !== "planned") throw new Error(`topology refused: ${result.refusal.code}`);
  return result.plan;
}

describe("v3 preparation-bound publication projection", () => {
  it.each([
    ["cohort", (value: V3DecomposeCutMap) => {
      value.authoring.placement = { kind: "cohort", cohort: "origin" };
      return {};
    }, { kind: "cohort", cohort: "origin" }],
    ["subcohort", (value: V3DecomposeCutMap) => {
      value.authoring.placement = { kind: "subcohort", cohort: "group/origin" };
      return {};
    }, { kind: "subcohort", cohort: "group/origin" }],
    ["at-cap", (value: V3DecomposeCutMap) => {
      value.authoring.placement = { kind: "at-cap", parent: "group/nested" };
      const bytes = renderV3IncompleteCohort(template, "group/nested");
      if (bytes === null) throw new Error("template must render");
      return { [v3CohortDocumentPath("group/nested")]: file(bytes) };
    }, { kind: "at-cap-fanout", parent: "group/nested", origin: "origin" }],
  ] as const)("binds the exact %s logical anchor and topology digest", (_name, configure, anchor) => {
    const value = map();
    const topology = plan(value, configure(value));

    const result = projectV3CandidateAuthority(value, topology);

    expect(result.status).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.authority.candidatePublication.logicalAnchor).toEqual(anchor);
    expect(result.authority.topology.facts.map(({ kind }) => kind))
      .toEqual(topology.actions.map(({ kind }) => kind));
    expect(result.authority.topology.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("preserves every existing target arm without making it continuation-eligible", () => {
    const value = map();
    value.authoring.shape = "heterogeneous";
    value.authoring.placement = { kind: "direct-member" };
    value.authoring.destinations = [
      { kind: "new-member", destinationId: "a-new", slug: "alpha", workClass: "Light" },
      {
        kind: "existing-home",
        destinationId: "b-document",
        target: { kind: "document", path: ".arc/reference/shared.md" },
      },
      {
        kind: "existing-home",
        destinationId: "c-draft",
        target: {
          kind: "draft-block",
          slug: "planning",
          locator: {
            artifact: "draft-planning.md",
            kind: "section",
            level: 2,
            headingSource: "Scope",
            ancestry: [],
            occurrence: 0,
          },
        },
      },
      {
        kind: "existing-home",
        destinationId: "d-work-unit",
        target: { kind: "work-unit", slug: "existing" },
      },
    ];
    value.authoring.internalEdges = [];
    value.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "a-new",
      targetLocator: { artifact: "draft-alpha.md", kind: "preamble" },
    };
    value.authoring.incomingDispositions[0]!.disposition = {
      kind: "replace",
      replacementTargets: ["alpha"],
    };

    const result = projectV3CandidateAuthority(value, plan(value));

    expect(result.status).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.authority.candidatePublication).toEqual({
      logicalAnchor: { kind: "direct-member", slug: "alpha" },
      entries: [
        { kind: "new-leaf", slug: "alpha" },
        {
          kind: "existing-destination",
          destinationId: "b-document",
          target: { kind: "document", path: ".arc/reference/shared.md" },
        },
        {
          kind: "existing-destination",
          destinationId: "c-draft",
          target: {
            kind: "draft-block",
            slug: "planning",
            locator: {
              artifact: "draft-planning.md",
              kind: "section",
              level: 2,
              headingSource: "Scope",
              ancestry: [],
              occurrence: 0,
            },
          },
        },
        {
          kind: "existing-destination",
          destinationId: "d-work-unit",
          target: { kind: "work-unit", slug: "existing" },
        },
      ],
    });
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["existing"] },
      result.authority.candidatePublication,
    )).toBeNull();
  });

  it("filters coordination while preserving destination order and the new-leaf subsequence", () => {
    const value = map();
    value.authoring.shape = "heterogeneous";
    value.authoring.destinations = [
      { kind: "new-member", destinationId: "a-zeta", slug: "zeta", workClass: "Light" },
      {
        kind: "cohort-coordination",
        destinationId: "b-coordination",
        cohort: "origin",
      },
      {
        kind: "existing-home",
        destinationId: "c-existing",
        target: { kind: "work-unit", slug: "existing" },
      },
      { kind: "new-member", destinationId: "d-alpha", slug: "alpha", workClass: "Heavy" },
    ];
    value.authoring.internalEdges = [{ from: "zeta", to: "alpha" }];
    value.authoring.sourceAllocations[0]!.disposition = {
      kind: "target",
      destinationId: "a-zeta",
      targetLocator: { artifact: "draft-zeta.md", kind: "preamble" },
    };
    value.authoring.incomingDispositions[0]!.disposition = {
      kind: "replace",
      replacementTargets: ["zeta"],
    };

    const result = projectV3CandidateAuthority(value, plan(value));

    expect(result.status).toBe("projected");
    if (result.status !== "projected") return;
    expect(result.authority.candidatePublication.entries).toEqual([
      { kind: "new-leaf", slug: "zeta" },
      {
        kind: "existing-destination",
        destinationId: "c-existing",
        target: { kind: "work-unit", slug: "existing" },
      },
      { kind: "new-leaf", slug: "alpha" },
    ]);
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["zeta", "alpha"] },
      result.authority.candidatePublication,
    )).toEqual({ kind: "selected", slugs: ["zeta", "alpha"] });
    expect(parseV3DecomposeContinuationInput(
      { kind: "selected", slugs: ["alpha", "zeta"] },
      result.authority.candidatePublication,
    )).toBeNull();
  });

  it("refuses missing, extra, mismatched, drifted, and unstable authority", () => {
    const value = map();
    const topology = plan(value);
    const wrongAnchor = structuredClone(topology);
    wrongAnchor.logicalAnchor = { kind: "cohort", cohort: "other" };
    expect(projectV3CandidateAuthority(value, wrongAnchor)).toMatchObject({
      status: "refused",
      refusal: { code: "logical-anchor-mismatch" },
    });

    const missing = structuredClone(topology);
    missing.actions = [];
    expect(projectV3CandidateAuthority(value, missing)).toMatchObject({
      status: "refused",
      refusal: { code: "topology-action-mismatch" },
    });

    const extra = structuredClone(topology);
    extra.actions.push({ kind: "none" });
    expect(projectV3CandidateAuthority(value, extra)).toMatchObject({
      status: "refused",
      refusal: { code: "topology-action-mismatch" },
    });

    const mismatched = structuredClone(topology);
    mismatched.actions[0] = { kind: "none" };
    expect(projectV3CandidateAuthority(value, mismatched)).toMatchObject({
      status: "refused",
      refusal: { code: "topology-action-mismatch" },
    });

    const drifted = structuredClone(topology);
    drifted.constituents = ["member-a"];
    expect(projectV3CandidateAuthority(value, drifted)).toMatchObject({
      status: "refused",
      refusal: { code: "constituent-mismatch" },
    });

    const unstable = map();
    unstable.authoring.destinations.reverse();
    expect(projectV3CandidateAuthority(unstable, topology)).toEqual({
      status: "refused",
      refusal: { code: "invalid-map" },
    });
  });
});
