import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import type { V3MaterializationResult } from "../../../src/lib/work-unit/decompose-v3-materializer.js";
import type {
  V3ValidatedPathMutation,
  ValidatedDecomposePlan,
} from "../../../src/lib/work-unit/decompose-v3-plan.js";
import { reportV3DecomposeResult } from "../../../src/lib/work-unit/decompose-v3-result-report.js";
import { createProspectiveTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";
import type { V3TopologyFact } from "../../../src/lib/work-unit/decompose-v3-preparation.js";

const absent = { kind: "absent" as const };
const final = {
  kind: "file" as const,
  mode: "100644" as const,
  contentDigest: canonicalDigest("final"),
};

function topologyMutation(
  path: string,
  action: "create" | "ensure" | "backfill" | "reuse" | "append",
): V3ValidatedPathMutation {
  return {
    kind: "composed",
    path,
    before: absent,
    after: final,
    contributors: [{
      kind: "topology",
      action,
      contributorIdentity: `${action}:${path}`,
      before: absent,
      after: final,
    }],
  };
}

function contentMutation(path: string): V3ValidatedPathMutation {
  return {
    kind: "composed",
    path,
    before: absent,
    after: final,
    contributors: [{
      kind: "content",
      destinationId: "member",
      destinationKind: "new-member",
      artifactRole: "meta",
      contributorKind: "scaffold",
      contributorIdentity: "member-meta",
      sourceProjection: [],
      disposition: "whole-file",
      before: absent,
      after: final,
    }],
  };
}

function plan(
  mutations: V3ValidatedPathMutation[],
  topologyFacts: Array<
    { kind: "none" }
    | { kind: "create" | "ensure" | "backfill" | "reuse" | "append"; path: string }
  >,
): ValidatedDecomposePlan {
  const planId = canonicalDigest("plan");
  const allowedPaths = mutations.map(({ path }) => path);
  const facts: V3TopologyFact[] = topologyFacts.map((fact) => fact.kind === "none"
    ? fact
    : {
        ...fact,
        before: fact.kind === "ensure" || fact.kind === "reuse" ? final : absent,
        after: final,
      });
  return {
    planId,
    cutMapDigest: canonicalDigest("cut-map"),
    sourceHead: "source-head",
    expectedBaseHead: "base-head",
    candidateAuthority: {
      candidatePublication: {
        logicalAnchor: { kind: "direct-member", slug: "member" },
        entries: [{ kind: "new-leaf", slug: "member" }],
      },
      topology: { facts, digest: canonicalDigest(facts) },
    },
    allowedPaths,
    allowedPathsDigest: canonicalDigest(allowedPaths),
    prospectiveOverlay: createProspectiveTransitionOverlay({
      origin: "origin",
      sourceBranch: "plan/origin",
      planId,
    }),
    roadmap: null,
    mutations,
  };
}

function materialized(
  source: ValidatedDecomposePlan,
  dispositions: Array<"applied" | "already-applied">,
): V3MaterializationResult {
  return {
    status: "materialized",
    members: [],
    paths: source.mutations.map((mutation, index) => ({
      path: mutation.path,
      mutation,
      disposition: dispositions[index] ?? "applied",
    })),
  };
}

describe("v3 decomposition result reporting", () => {
  it("reports standalone, nested, missing-parent, and at-cap topology actions from planned facts", () => {
    const actions = [
      { kind: "create" as const, path: ".arc/backlog/planned/member/meta-member.md" },
      { kind: "ensure" as const, path: ".arc/backlog/planned/cohort/cohort-cohort.md" },
      { kind: "backfill" as const, path: ".arc/backlog/planned/cohort/child/cohort-child.md" },
      { kind: "append" as const, path: ".arc/backlog/planned/parent/cohort-parent.md" },
    ];
    const mutations = actions.map(({ path, kind }) => topologyMutation(path, kind));
    const source = plan(mutations, actions);
    const report = reportV3DecomposeResult(
      source,
      materialized(source, ["applied", "already-applied", "applied", "applied"]),
    );
    expect(report.topology).toEqual([
      { kind: "topology", action: "create", path: actions[0]?.path, disposition: "applied" },
      { kind: "topology", action: "ensure", path: actions[1]?.path, disposition: "already-applied" },
      { kind: "topology", action: "backfill", path: actions[2]?.path, disposition: "applied" },
      { kind: "topology", action: "append", path: actions[3]?.path, disposition: "applied" },
    ]);
  });

  it("keeps reuse and none as no-write facts while reporting one composed destination write", () => {
    const path = ".arc/backlog/planned/cohort/cohort-cohort.md";
    const mutation = contentMutation(path);
    const source = plan([mutation], [{ kind: "reuse", path }]);
    const report = reportV3DecomposeResult(source, materialized(source, ["applied"]));
    expect(report.topology).toEqual([
      { kind: "topology", action: "reuse", path, disposition: "no-write" },
    ]);
    expect(report.destinations).toEqual([{
      kind: "destination",
      path,
      destinationId: "member",
      destinationKind: "new-member",
      authoring: {
        artifactRole: "meta",
        contributorKind: "scaffold",
        disposition: "whole-file",
      },
      disposition: "applied",
    }]);
    expect(report.paths).toHaveLength(1);

    const none = plan([], [{ kind: "none" }]);
    expect(reportV3DecomposeResult(none, materialized(none, [])).topology).toEqual([
      { kind: "topology", action: "none", disposition: "no-write" },
    ]);
  });

  it("projects a materializer refusal only onto its exact conflicting path", () => {
    const first = contentMutation(".arc/active/meta-first.md");
    const second = contentMutation(".arc/active/meta-second.md");
    const source = plan([first, second], []);
    const report = reportV3DecomposeResult(source, {
      status: "refused",
      reason: "path-conflict",
      path: second.path,
      appliedPaths: [],
    });
    expect(report).toMatchObject({
      status: "refused",
      paths: [{ path: second.path, disposition: "refused-conflict" }],
      destinations: [{ path: second.path, disposition: "refused-conflict" }],
    });
    expect(JSON.stringify(report)).not.toContain("Purpose");
    expect(JSON.stringify(report)).not.toContain("sequencing");

    expect(reportV3DecomposeResult(source, {
      status: "refused",
      reason: "apply-failed",
      path: second.path,
      appliedPaths: [first.path],
    })).toMatchObject({
      status: "refused",
      paths: [],
      topology: [],
      destinations: [],
    });
  });
});
