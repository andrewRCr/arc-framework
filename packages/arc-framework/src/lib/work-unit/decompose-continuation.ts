/**
 * Closed validation of the ephemeral decomposition continuation choice.
 *
 * The validator joins only a readiness-approved selection to the immutable
 * publication carried by one authenticated preparation. It performs no I/O and
 * persists no intermediate choice.
 *
 * @module
 */

import type { ProjectReadinessCompositionResult } from "../status/project-view.js";
import {
  parseV3DecomposePreparation,
  type V3CandidatePublication,
} from "./decompose-v3-preparation.js";
import {
  V3DecomposeContinuationInputSchema,
  type V3DecomposeContinuationInput,
} from "./decompose-v3-receipt.js";
import {
  resolveLaunchReadiness,
  type DecomposeLaunchBlocker,
  type DecomposeReadinessDeps,
} from "./decompose-launch-readiness.js";

/** Final publication shape produced only after continuation validation. */
export type ValidatedV3DecomposePublication = V3CandidatePublication & {
  initialContinuation: V3DecomposeContinuationInput;
};

/** Closed refusal classes for continuation syntax, selection, and readiness. */
export type V3DecomposeContinuationIssueCode =
  | "preparation-invalid"
  | "continuation-malformed"
  | "selection-absent"
  | "selection-existing-destination"
  | "selection-duplicate"
  | "selection-order-mismatch"
  | "selection-blocked"
  | "selection-refused";

/** One exact continuation validation issue. */
export interface V3DecomposeContinuationIssue {
  code: V3DecomposeContinuationIssueCode;
  locus: string;
  slug?: string;
  blockers?: readonly DecomposeLaunchBlocker[];
}

/** Inputs for validating one post-authoring continuation choice. */
export interface ValidateV3DecomposeContinuationInput {
  continuation: unknown;
  preparation: unknown;
  composition: ProjectReadinessCompositionResult;
  deps: DecomposeReadinessDeps;
}

/** Closed continuation validation result. */
export type ValidateV3DecomposeContinuationResult =
  | { status: "validated"; publication: ValidatedV3DecomposePublication }
  | { status: "refused"; issues: readonly V3DecomposeContinuationIssue[] };

function issueLocus(path: readonly PropertyKey[]): string {
  let locus = "continuation";
  for (const segment of path) {
    locus += typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`;
  }
  return locus;
}

function existingDestinationSlugs(publication: V3CandidatePublication): Set<string> {
  return new Set(publication.entries.flatMap((entry) => {
    if (entry.kind !== "existing-destination" || entry.target.kind === "document") return [];
    return [entry.target.slug];
  }));
}

function validateSelection(
  continuation: Extract<V3DecomposeContinuationInput, { kind: "selected" }>,
  publication: V3CandidatePublication,
): V3DecomposeContinuationIssue[] {
  const newLeafOrder = publication.entries.flatMap((entry) =>
    entry.kind === "new-leaf" ? [entry.slug] : []);
  const newLeafIndex = new Map(newLeafOrder.map((slug, index) => [slug, index]));
  const existingSlugs = existingDestinationSlugs(publication);
  const seen = new Set<string>();
  const issues: V3DecomposeContinuationIssue[] = [];
  let previous = -1;

  continuation.slugs.forEach((slug, selectionIndex) => {
    const locus = `continuation.slugs[${selectionIndex}]`;
    const publicationIndex = newLeafIndex.get(slug);
    if (seen.has(slug)) {
      issues.push({ code: "selection-duplicate", locus, slug });
      return;
    }
    seen.add(slug);
    if (publicationIndex === undefined) {
      issues.push({
        code: existingSlugs.has(slug) ? "selection-existing-destination" : "selection-absent",
        locus,
        slug,
      });
      return;
    }
    if (publicationIndex <= previous) {
      issues.push({ code: "selection-order-mismatch", locus, slug });
      return;
    }
    previous = publicationIndex;
  });

  return issues;
}

function validateReadiness(
  continuation: Extract<V3DecomposeContinuationInput, { kind: "selected" }>,
  composition: ProjectReadinessCompositionResult,
  deps: DecomposeReadinessDeps,
): V3DecomposeContinuationIssue[] {
  return continuation.slugs.flatMap((slug, index): V3DecomposeContinuationIssue[] => {
    const readiness = resolveLaunchReadiness({ slug, composition, deps });
    if (readiness.kind === "ready") return [];
    return [{
      code: readiness.kind === "blocked" ? "selection-blocked" : "selection-refused",
      locus: `continuation.slugs[${index}]`,
      slug,
      blockers: readiness.blockers,
    }];
  });
}

/**
 * Validate and join one continuation choice to preparation-bound publication.
 *
 * @param input - Continuation bytes, authenticated preparation candidate, pinned
 * project composition, and the shared readiness bundle.
 * @returns Only the joined publication or typed, source-addressable issues.
 */
export function validateV3DecomposeContinuation(
  input: ValidateV3DecomposeContinuationInput,
): ValidateV3DecomposeContinuationResult {
  const preparation = parseV3DecomposePreparation(input.preparation);
  if (preparation === null) {
    return { status: "refused", issues: [{ code: "preparation-invalid", locus: "preparation" }] };
  }

  const continuation = V3DecomposeContinuationInputSchema.safeParse(input.continuation);
  if (!continuation.success) {
    return {
      status: "refused",
      issues: continuation.error.issues.map((issue) => ({
        code: "continuation-malformed",
        locus: issueLocus(issue.path),
      })),
    };
  }

  if (continuation.data.kind === "selected") {
    const selectionIssues = validateSelection(continuation.data, preparation.facts.candidatePublication);
    if (selectionIssues.length > 0) return { status: "refused", issues: selectionIssues };
    const readinessIssues = validateReadiness(
      continuation.data,
      input.composition,
      input.deps,
    );
    if (readinessIssues.length > 0) return { status: "refused", issues: readinessIssues };
  }

  return {
    status: "validated",
    publication: {
      ...preparation.facts.candidatePublication,
      initialContinuation: continuation.data,
    },
  };
}
