/**
 * Pure resolver for one landed decomposition publication.
 *
 * The caller owns all repository reads. This module consumes one pinned
 * configured-base snapshot plus its race-closing ref reread and returns only
 * durable authority and live, facts-only publication projections.
 */

import { canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import {
  parseV3DecomposePreparation,
  type V3CandidatePublication,
} from "./decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DecomposeContinuationInput,
  type V3DecomposeReceipt,
} from "./decompose-v3-receipt.js";
import {
  produceDecompositionIntegrationAnchor,
  type DecompositionIntegrationAnchor,
  type DecompositionIntegrationFacts,
} from "./decomposition-integration-anchor.js";
import {
  validateRetirementRecordEnumeration,
  type RetirementRecordEnumerationEntry,
} from "./retirement-record-enumeration.js";

export interface LandedReadinessBlocker {
  code: string;
  locus: string;
}

export type LandedLaunchReadiness =
  | { kind: "ready" }
  | {
    kind: "blocked" | "refused";
    blockers: readonly LandedReadinessBlocker[];
  };

export type LandedPublicationResolutionEntry =
  | {
    kind: "new-leaf";
    slug: string;
    displayPath: string;
    readiness: LandedLaunchReadiness;
  }
  | {
    kind: "existing-destination";
    destinationId: string;
    target: Extract<
      V3CandidatePublication["entries"][number],
      { kind: "existing-destination" }
    >["target"];
    displayPath: string;
  };

export type LandedDecompositionDisplayAnchor =
  V3CandidatePublication["logicalAnchor"] & { displayPath: string };

export interface LandedPublicationResolution {
  anchor: LandedDecompositionDisplayAnchor;
  entries: readonly LandedPublicationResolutionEntry[];
}

export interface LandedDecompositionHandoffInput {
  originalSlug: string;
  snapshot: {
    configuredBaseHead: string;
    retirementNamespace: readonly RetirementRecordEnumerationEntry[];
    integration: Omit<DecompositionIntegrationFacts, "receipts" | "currentBaseHead">;
    publication: LandedPublicationResolution;
  };
  /** Race-closing reread of the configured base ref. */
  rereadConfiguredBaseHead: string;
}

export type LandedDecompositionHandoffEntry = LandedPublicationResolutionEntry;

export interface LandedDecompositionHandoff {
  kind: "landed-decomposition-handoff";
  schemaVersion: 1;
  authority: {
    configuredBaseHead: string;
    receiptId: CanonicalDigest;
    preparationId: CanonicalDigest;
    sourceHead: string;
    candidateCommitHead: string;
    landedCommitHead: string;
    landedTree: string;
  };
  /** Exact shared authority also consumed by start and cleanup. */
  integrationAnchor: DecompositionIntegrationAnchor;
  logicalAnchor: V3CandidatePublication["logicalAnchor"];
  displayAnchor: LandedDecompositionDisplayAnchor;
  entries: readonly LandedDecompositionHandoffEntry[];
  initialContinuation: V3DecomposeContinuationInput;
  selectedReadiness: readonly {
    slug: string;
    readiness: LandedLaunchReadiness;
  }[];
  launchableSelected: readonly {
    slug: string;
    displayPath: string;
  }[];
}

export type LandedDecompositionHandoffResult =
  | { status: "absent" }
  | {
    status: "namespace-corrupt";
    reason?: Extract<
      ReturnType<typeof produceDecompositionIntegrationAnchor>,
      { status: "refused" }
    >["reason"];
  }
  | { status: "projection-mismatch" }
  | { status: "ambiguous" }
  | { status: "not-landed" }
  | { status: "stale-base" }
  | { status: "resolved"; handoff: LandedDecompositionHandoff };

/** Already-selected exact-base authority and its live publication projection. */
export interface ComposeLandedDecompositionHandoffInput {
  originalSlug: string;
  integrationAnchor: DecompositionIntegrationAnchor;
  publication: LandedPublicationResolution;
}

/**
 * Compose a facts-only handoff from the shared exact-base anchor.
 *
 * @param input - Exact anchor plus live publication projection
 * @returns One handoff or a closed projection mismatch
 */
export function composeLandedDecompositionHandoff(
  input: ComposeLandedDecompositionHandoffInput,
): LandedDecompositionHandoffResult {
  const { integrationAnchor: anchor } = input;
  if (anchor.origin !== input.originalSlug) return { status: "absent" };
  const publication = anchor.receipt.finalized.publication;
  if (!publicationIsExact(publication, input.publication)) {
    return { status: "projection-mismatch" };
  }

  const newLeaves = new Map(
    input.publication.entries.flatMap((entry) =>
      entry.kind === "new-leaf" ? [[entry.slug, entry] as const] : []),
  );
  const initialContinuation = publication.initialContinuation;
  const selectedSlugs = initialContinuation.kind === "selected"
    ? initialContinuation.slugs
    : [];
  const selectedReadiness = selectedSlugs.flatMap((slug) => {
    const entry = newLeaves.get(slug);
    return entry === undefined ? [] : [{ slug, readiness: entry.readiness }];
  });
  if (selectedReadiness.length !== selectedSlugs.length) {
    return { status: "namespace-corrupt" };
  }
  const launchableSelected = selectedSlugs.flatMap((slug) => {
    const entry = newLeaves.get(slug);
    return entry?.readiness.kind === "ready"
      ? [{ slug, displayPath: entry.displayPath }]
      : [];
  });

  return {
    status: "resolved",
    handoff: {
      kind: "landed-decomposition-handoff",
      schemaVersion: 1,
      authority: {
        configuredBaseHead: anchor.currentBaseHead,
        receiptId: anchor.receiptId,
        preparationId: anchor.preparationId,
        sourceHead: anchor.sourceHead,
        candidateCommitHead: anchor.candidateCommitHead,
        landedCommitHead: anchor.landedCommitHead,
        landedTree: anchor.landedTree,
      },
      integrationAnchor: anchor,
      logicalAnchor: publication.logicalAnchor,
      displayAnchor: input.publication.anchor,
      entries: input.publication.entries,
      initialContinuation,
      selectedReadiness,
      launchableSelected,
    },
  };
}

function nonEmpty(value: string): boolean {
  return value.trim() !== "";
}

function receiptHasCanonicalPreparation(receipt: V3DecomposeReceipt): boolean {
  const preparation = parseV3DecomposePreparation({
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId: receipt.receiptId,
    preparationId: receipt.preparationId,
    facts: receipt.prepared,
  });
  return preparation !== null && parseV3DecomposeReceipt(receipt, preparation) !== null;
}

function validReadiness(readiness: LandedLaunchReadiness): boolean {
  if (readiness.kind === "ready") return true;
  return readiness.blockers.length > 0
    && readiness.blockers.every(({ code, locus }) => nonEmpty(code) && nonEmpty(locus));
}

function expectedEntryIdentity(
  entry: V3CandidatePublication["entries"][number],
): unknown {
  return entry.kind === "new-leaf"
    ? { kind: entry.kind, slug: entry.slug }
    : {
      kind: entry.kind,
      destinationId: entry.destinationId,
      target: entry.target,
    };
}

function actualEntryIdentity(entry: LandedPublicationResolutionEntry): unknown {
  return entry.kind === "new-leaf"
    ? { kind: entry.kind, slug: entry.slug }
    : {
      kind: entry.kind,
      destinationId: entry.destinationId,
      target: entry.target,
    };
}

function displayAnchorIdentity(anchor: LandedDecompositionDisplayAnchor): unknown {
  switch (anchor.kind) {
    case "direct-member":
      return { kind: anchor.kind, slug: anchor.slug };
    case "cohort":
    case "subcohort":
      return { kind: anchor.kind, cohort: anchor.cohort };
    case "at-cap-fanout":
      return { kind: anchor.kind, parent: anchor.parent, origin: anchor.origin };
  }
}

function publicationIsExact(
  expected: V3CandidatePublication,
  actual: LandedPublicationResolution,
): boolean {
  if (!nonEmpty(actual.anchor.displayPath)
    || canonicalize(displayAnchorIdentity(actual.anchor)) !== canonicalize(expected.logicalAnchor)
    || actual.entries.length !== expected.entries.length) return false;

  for (let index = 0; index < expected.entries.length; index += 1) {
    const expectedEntry = expected.entries[index];
    const actualEntry = actual.entries[index];
    if (expectedEntry === undefined || actualEntry === undefined
      || !nonEmpty(actualEntry.displayPath)
      || canonicalize(actualEntryIdentity(actualEntry))
        !== canonicalize(expectedEntryIdentity(expectedEntry))
      || (actualEntry.kind === "new-leaf" && !validReadiness(actualEntry.readiness))) {
      return false;
    }
  }
  return true;
}

function anchorFailure(
  result: Exclude<
    ReturnType<typeof produceDecompositionIntegrationAnchor>,
    { status: "resolved" }
  >,
): LandedDecompositionHandoffResult {
  switch (result.status) {
    case "absent":
      return { status: "absent" };
    case "ambiguous":
      return { status: "ambiguous" };
    case "not-landed":
      return { status: "not-landed" };
    case "stale":
      return { status: "stale-base" };
    case "refused":
      return { status: "namespace-corrupt", reason: result.reason };
  }
}

/**
 * Resolve one original slug from an authenticated configured-base namespace.
 *
 * No history search, workspace state, descendant-base mobility, command
 * construction, mutation, or launch frontier is represented here.
 */
export function resolveLandedDecompositionHandoff(
  input: LandedDecompositionHandoffInput,
): LandedDecompositionHandoffResult {
  const namespace = validateRetirementRecordEnumeration(input.snapshot.retirementNamespace);
  if (namespace.status !== "valid") return { status: "namespace-corrupt" };
  if (namespace.records.some((record) =>
    record.record.kind === "v3-decomposition-receipt"
      && !receiptHasCanonicalPreparation(record.record.value))) {
    return { status: "namespace-corrupt" };
  }

  const receipts = namespace.records.flatMap((record) =>
    record.record.kind === "v3-decomposition-receipt"
      && record.record.value.prepared.completedMap.machine.source.origin === input.originalSlug
      ? [record.record.value]
      : []);
  if (receipts.length === 0) return { status: "absent" };
  if (receipts.length !== 1) return { status: "ambiguous" };

  const anchorResult = produceDecompositionIntegrationAnchor({
    ...input.snapshot.integration,
    receipts,
    currentBaseHead: input.snapshot.configuredBaseHead,
  });
  if (anchorResult.status !== "resolved") return anchorFailure(anchorResult);
  if (input.rereadConfiguredBaseHead !== input.snapshot.configuredBaseHead) {
    return { status: "stale-base" };
  }
  return composeLandedDecompositionHandoff({
    originalSlug: input.originalSlug,
    integrationAnchor: anchorResult.anchor,
    publication: input.snapshot.publication,
  });
}
