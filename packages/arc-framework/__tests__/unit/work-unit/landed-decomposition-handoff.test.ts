import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import {
  composeLandedDecompositionHandoff,
  resolveLandedDecompositionHandoff,
  type LandedDecompositionHandoffInput,
  type LandedPublicationResolution,
} from "../../../src/lib/work-unit/landed-decomposition-handoff.js";
import {
  produceDecompositionIntegrationAnchor,
} from "../../../src/lib/work-unit/decomposition-integration-anchor.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const BASE_HEAD = "c".repeat(40);
const PREPARED_BASE = "b".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);

function namespaceEntry(content?: string) {
  const { receipt } = v3DecompositionEvidenceFixture();
  return {
    filename: `${receipt.receiptId.replace(":", "-")}.json`,
    mode: "100644",
    type: "blob",
    content: content ?? canonicalize(receipt),
  };
}

function publication(
  overrides: Partial<LandedPublicationResolution> = {},
): LandedPublicationResolution {
  return {
    anchor: {
      kind: "cohort",
      cohort: "origin",
      displayPath: ".arc/backlog/planned/origin",
    },
    entries: [
      {
        kind: "new-leaf",
        slug: "member-a",
        displayPath: ".arc/backlog/planned/origin/member-a",
        readiness: { kind: "ready" },
      },
      {
        kind: "new-leaf",
        slug: "member-b",
        displayPath: ".arc/backlog/planned/origin/member-b",
        readiness: {
          kind: "blocked",
          blockers: [{ code: "dependency-unshipped", locus: "depends-on: foundation" }],
        },
      },
    ],
    ...overrides,
  };
}

function input(
  overrides: Partial<LandedDecompositionHandoffInput> = {},
): LandedDecompositionHandoffInput {
  return {
    originalSlug: "origin",
    snapshot: {
      configuredBaseHead: BASE_HEAD,
      retirementNamespace: [namespaceEntry()],
      integration: {
        preparedBaseHead: PREPARED_BASE,
        candidateCommit: { head: BASE_HEAD, tree: CANDIDATE_TREE },
        receiptTransitionTree: CANDIDATE_TREE,
        baseDescent: { kind: "exact" },
        landingRelation: { kind: "exact" },
        landing: {
          kind: "fast-forward",
          beforeHead: PREPARED_BASE,
          resultHead: BASE_HEAD,
          resultTree: CANDIDATE_TREE,
        },
      },
      publication: publication(),
    },
    rereadConfiguredBaseHead: BASE_HEAD,
    ...overrides,
  };
}

describe("resolveLandedDecompositionHandoff", () => {
  it("composes from the exact shared anchor without changing its bytes", () => {
    const candidate = input();
    const selection = produceDecompositionIntegrationAnchor({
      ...candidate.snapshot.integration,
      receipts: [v3DecompositionEvidenceFixture().receipt],
      currentBaseHead: candidate.snapshot.configuredBaseHead,
    });
    expect(selection.status).toBe("resolved");
    if (selection.status !== "resolved") return;

    const result = composeLandedDecompositionHandoff({
      originalSlug: "origin",
      integrationAnchor: selection.anchor,
      publication: candidate.snapshot.publication,
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.handoff.authority).toEqual({
      configuredBaseHead: selection.anchor.currentBaseHead,
      receiptId: selection.anchor.receiptId,
      preparationId: selection.anchor.preparationId,
      sourceHead: selection.anchor.sourceHead,
      candidateCommitHead: selection.anchor.candidateCommitHead,
      landedCommitHead: selection.anchor.landedCommitHead,
      landedTree: selection.anchor.landedTree,
    });
    expect(canonicalize(selection.anchor.receipt)).toBe(canonicalize(
      v3DecompositionEvidenceFixture().receipt,
    ));
  });

  it("resolves exact landed authority and keeps immutable selection separate from readiness", () => {
    const result = resolveLandedDecompositionHandoff(input());

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.handoff).toMatchObject({
      kind: "landed-decomposition-handoff",
      schemaVersion: 1,
      authority: {
        configuredBaseHead: BASE_HEAD,
        receiptId: v3DecompositionEvidenceFixture().receipt.receiptId,
        preparationId: v3DecompositionEvidenceFixture().receipt.preparationId,
        landedCommitHead: BASE_HEAD,
        landedTree: CANDIDATE_TREE,
      },
      logicalAnchor: { kind: "cohort", cohort: "origin" },
      displayAnchor: {
        kind: "cohort",
        cohort: "origin",
        displayPath: ".arc/backlog/planned/origin",
      },
      initialContinuation: { kind: "selected", slugs: ["member-a"] },
      selectedReadiness: [{ slug: "member-a", readiness: { kind: "ready" } }],
      launchableSelected: [{
        slug: "member-a",
        displayPath: ".arc/backlog/planned/origin/member-a",
      }],
    });
    expect(result.handoff.entries.flatMap((entry) =>
      entry.kind === "new-leaf" ? [entry.slug] : [])).toEqual(["member-a", "member-b"]);
    expect(Object.keys(result.handoff)).not.toContain("integrationAnchor");
    expect(canonicalize(result.handoff)).not.toContain('"receipt":');
    expect(canonicalize(result.handoff)).not.toMatch(/argv|command|resume|frontier/u);
  });

  it("resolves handoff authority after the configured base descends past the landing", () => {
    const descendantHead = "e".repeat(40);
    const exact = input();
    const result = resolveLandedDecompositionHandoff(input({
      snapshot: {
        ...exact.snapshot,
        configuredBaseHead: descendantHead,
        integration: {
          ...exact.snapshot.integration,
          baseDescent: { kind: "descendant", from: BASE_HEAD, to: descendantHead },
        },
      },
      rereadConfiguredBaseHead: descendantHead,
    }));

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.handoff.authority).toMatchObject({
      configuredBaseHead: descendantHead,
      landedCommitHead: BASE_HEAD,
    });
  });

  it("preserves selected blocker order and excludes unselected ready leaves", () => {
    const selectedBlocked = input();
    selectedBlocked.snapshot.publication = publication({
      entries: [
        {
          kind: "new-leaf",
          slug: "member-a",
          displayPath: "moved/member-a",
          readiness: {
            kind: "blocked",
            blockers: [
              { code: "dependency-unshipped", locus: "depends-on: one" },
              { code: "provider-blocked", locus: "member-a" },
            ],
          },
        },
        {
          kind: "new-leaf",
          slug: "member-b",
          displayPath: "moved/member-b",
          readiness: { kind: "ready" },
        },
      ],
    });

    const result = resolveLandedDecompositionHandoff(selectedBlocked);

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.handoff.selectedReadiness).toEqual([{
      slug: "member-a",
      readiness: {
        kind: "blocked",
        blockers: [
          { code: "dependency-unshipped", locus: "depends-on: one" },
          { code: "provider-blocked", locus: "member-a" },
        ],
      },
    }]);
    expect(result.handoff.launchableSelected).toEqual([]);
  });

  it("keeps explicit none authoritative even when every new leaf is ready", () => {
    const { receipt } = v3DecompositionEvidenceFixture();
    receipt.finalized.publication.initialContinuation = { kind: "none" };
    const candidate = input();
    candidate.snapshot.retirementNamespace = [namespaceEntry(canonicalize(receipt))];
    candidate.snapshot.publication = publication({
      entries: publication().entries.map((entry) =>
        entry.kind === "new-leaf"
          ? { ...entry, readiness: { kind: "ready" as const } }
          : entry),
    });

    const result = resolveLandedDecompositionHandoff(candidate);

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.handoff.initialContinuation).toEqual({ kind: "none" });
    expect(result.handoff.selectedReadiness).toEqual([]);
    expect(result.handoff.launchableSelected).toEqual([]);
  });

  it("keeps receipt authority immutable while live display and readiness change", () => {
    const first = resolveLandedDecompositionHandoff(input());
    const moved = input();
    moved.snapshot.publication = publication({
      anchor: {
        kind: "cohort",
        cohort: "origin",
        displayPath: ".arc/backlog/planned/moved-origin",
      },
      entries: [
        {
          kind: "new-leaf",
          slug: "member-a",
          displayPath: ".arc/backlog/planned/moved-origin/member-a",
          readiness: {
            kind: "blocked",
            blockers: [{ code: "provider-blocked", locus: "member-a" }],
          },
        },
        {
          kind: "new-leaf",
          slug: "member-b",
          displayPath: ".arc/backlog/planned/moved-origin/member-b",
          readiness: { kind: "ready" },
        },
      ],
    });
    const second = resolveLandedDecompositionHandoff(moved);

    expect(first.status).toBe("resolved");
    expect(second.status).toBe("resolved");
    if (first.status !== "resolved" || second.status !== "resolved") return;
    expect(second.handoff.authority).toEqual(first.handoff.authority);
    expect(second.handoff.displayAnchor).not.toEqual(first.handoff.displayAnchor);
    expect(second.handoff.selectedReadiness).not.toEqual(first.handoff.selectedReadiness);
    expect(second.handoff.initialContinuation).toEqual(first.handoff.initialContinuation);
  });

  it.each([
    ["absent", input({ snapshot: { ...input().snapshot, retirementNamespace: [] } }), "absent"],
    [
      "namespace-corrupt",
      input({ snapshot: { ...input().snapshot, retirementNamespace: [namespaceEntry("{}")] } }),
      "namespace-corrupt",
    ],
    [
      "not-landed",
      input({
        snapshot: {
          ...input().snapshot,
          integration: { ...input().snapshot.integration, landing: { kind: "not-landed" } },
        },
      }),
      "not-landed",
    ],
    ["stale-base", input({ rereadConfiguredBaseHead: "e".repeat(40) }), "stale-base"],
  ] as const)("returns %s without partial handoff", (_label, candidate, status) => {
    expect(resolveLandedDecompositionHandoff(candidate)).toEqual({ status });
  });

  it("returns ambiguous when the integration snapshot cannot identify one authority", () => {
    const candidate = input();
    candidate.snapshot.integration = {
      ...candidate.snapshot.integration,
      landing: { kind: "ambiguous" },
    };

    expect(resolveLandedDecompositionHandoff(candidate)).toEqual({ status: "ambiguous" });
  });

  it("preserves the integration-anchor refusal reason", () => {
    const candidate = input();
    candidate.snapshot.integration = {
      ...candidate.snapshot.integration,
      receiptTransitionTree: "f".repeat(40),
    };

    expect(resolveLandedDecompositionHandoff(candidate)).toEqual({
      status: "namespace-corrupt",
      reason: "transition-tree",
    });
  });

  it("distinguishes caller publication drift from stored namespace corruption", () => {
    const candidate = input();
    candidate.snapshot.publication = publication({
      entries: [...publication().entries].reverse(),
    });

    expect(resolveLandedDecompositionHandoff(candidate)).toEqual({ status: "projection-mismatch" });
  });
});
