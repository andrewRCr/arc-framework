/**
 * Shared launch-readiness reduction for decomposition continuation and landed handoff.
 *
 * The reducer consumes one pinned, lossless project composition. It performs no
 * repository reads and requires callers to inject the batch readiness provider.
 *
 * @module
 */

import {
  depsOnlyReadinessProvider,
  type ProjectReadinessAcceptedCandidate,
  type ProjectReadinessCompositionResult,
  type ProjectReadinessProvider,
  type ProjectReadinessRecord,
} from "../status/project-view.js";
import { buildLifecycleIndexFromRecords } from "./lifecycle-index.js";
import { resolveSlugQuery } from "./lifecycle-query.js";
import type { LifecycleState } from "./lifecycle-resolver.js";

/** Stable blocker classes returned by the shared launch-readiness reducer. */
export type DecomposeLaunchBlockerCode =
  | "composition-indeterminate"
  | "record-unreadable"
  | "record-malformed"
  | "record-unsupported-lifecycle"
  | "record-missing"
  | "record-duplicate"
  | "record-wrong-lifecycle"
  | "record-wrong-state"
  | "record-parked"
  | "dependency-missing"
  | "dependency-provisional"
  | "dependency-planned"
  | "dependency-planning"
  | "dependency-active"
  | "dependency-integrating"
  | "dependency-parked"
  | "provider-missing"
  | "provider-failed"
  | "provider-malformed"
  | "provider-missing-key"
  | "provider-extra-key"
  | "provider-blocked";

/** One exact reason launch readiness is not ready. */
export interface DecomposeLaunchBlocker {
  code: DecomposeLaunchBlockerCode;
  locus: string;
}

/** Closed launch-readiness result shared by candidate and landed consumers. */
export type DecomposeLaunchReadiness =
  | { kind: "ready" }
  | { kind: "blocked" | "refused"; blockers: readonly DecomposeLaunchBlocker[] };

/** One dependency edge classified against the pinned ordinary project view. */
export interface DecomposeDependencyFact {
  slug: string;
  state: LifecycleState;
  satisfied: boolean;
  locus: string;
}

/** One accepted candidate and its dependency facts supplied to the typed provider. */
export interface DecomposeReadinessCandidate {
  slug: string;
  record: ProjectReadinessRecord;
  dependencyFacts: readonly DecomposeDependencyFact[];
}

/** Typed provider verdict for one accepted project-record slug. */
export type DecomposeReadinessVerdict =
  | { kind: "ready" }
  | { kind: "blocked"; blockers: readonly DecomposeLaunchBlocker[] };

/** Required batch provider boundary used by both launch-readiness consumers. */
export interface DecomposeReadinessProvider {
  resolve(input: {
    candidates: readonly DecomposeReadinessCandidate[];
    composition: ProjectReadinessCompositionResult;
  }): ReadonlyMap<string, DecomposeReadinessVerdict>;
}

/** Shared dependency bundle for candidate continuation and landed handoff. */
export interface DecomposeReadinessDeps {
  readinessProvider: DecomposeReadinessProvider;
}

/** Inputs for one pure launch-readiness resolution. */
export interface ResolveLaunchReadinessInput {
  slug: string;
  composition: ProjectReadinessCompositionResult;
  deps: DecomposeReadinessDeps;
}

function lifecycleIndex(composition: ProjectReadinessCompositionResult) {
  return buildLifecycleIndexFromRecords(
    composition.records.map((record) => ({
      slug: record.slug,
      state: record.state,
      location: record.location,
      cohort: record.cohort ?? null,
      dependsOn: record.dependsOn,
      path: record.source.path,
    })),
  );
}

function dependencyCode(state: LifecycleState): DecomposeLaunchBlockerCode {
  switch (state) {
    case "nonexistent":
      return "dependency-missing";
    case "provisional":
      return "dependency-provisional";
    case "planned":
      return "dependency-planned";
    case "planning":
      return "dependency-planning";
    case "active":
      return "dependency-active";
    case "integrating":
      return "dependency-integrating";
    case "parked":
      return "dependency-parked";
    case "shipped":
      throw new Error("shipped dependencies do not produce blockers");
  }
}

function dependencyFacts(
  candidate: ProjectReadinessAcceptedCandidate,
  composition: ProjectReadinessCompositionResult,
): DecomposeDependencyFact[] {
  const index = lifecycleIndex(composition);
  return candidate.record.dependsOn.map((slug) => {
    const query = resolveSlugQuery(index, slug);
    return {
      slug,
      state: query.state,
      satisfied: query.shipped,
      locus: `${candidate.path}:Depends On:${slug}`,
    };
  });
}

function providerCandidates(
  composition: ProjectReadinessCompositionResult,
): DecomposeReadinessCandidate[] {
  return composition.acceptedCandidates.map((candidate) => ({
    slug: candidate.slug,
    record: candidate.record,
    dependencyFacts: dependencyFacts(candidate, composition),
  }));
}

function refused(blockers: readonly DecomposeLaunchBlocker[]): DecomposeLaunchReadiness {
  return { kind: "refused", blockers };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function validateTypedVerdict(value: unknown): value is DecomposeReadinessVerdict {
  if (value === null || typeof value !== "object") return false;
  const verdict = value as { kind?: unknown; blockers?: unknown };
  if (verdict.kind === "ready") return exactKeys(value, ["kind"]);
  if (verdict.kind !== "blocked" || !exactKeys(value, ["blockers", "kind"])) return false;
  return Array.isArray(verdict.blockers)
    && verdict.blockers.length > 0
    && verdict.blockers.every((blocker: unknown) => {
      if (blocker === null || typeof blocker !== "object" || !exactKeys(blocker, ["code", "locus"])) return false;
      const fields = blocker as { code?: unknown; locus?: unknown };
      return nonEmpty(fields.code) && nonEmpty(fields.locus);
    });
}

function mapKeys(value: unknown): string[] | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as { keys?: unknown; get?: unknown };
  if (typeof candidate.keys !== "function" || typeof candidate.get !== "function") return null;
  try {
    const keys = [...(candidate.keys as () => Iterable<unknown>)()];
    return keys.every((key): key is string => typeof key === "string") ? keys : null;
  } catch {
    return null;
  }
}

function providerKeyBlockers(
  result: unknown,
  expectedSlugs: ReadonlySet<string>,
): DecomposeLaunchBlocker[] {
  const keys = mapKeys(result);
  if (keys === null) return [{ code: "provider-malformed", locus: "readiness-provider:result" }];

  const blockers: DecomposeLaunchBlocker[] = [];
  for (const slug of expectedSlugs) {
    if (!keys.includes(slug)) blockers.push({ code: "provider-missing-key", locus: `readiness-provider:${slug}` });
  }
  for (const slug of keys) {
    if (!expectedSlugs.has(slug)) blockers.push({ code: "provider-extra-key", locus: `readiness-provider:${slug}` });
  }
  return blockers;
}

function providerContractBlockers(
  result: unknown,
  expectedSlugs: ReadonlySet<string>,
): DecomposeLaunchBlocker[] {
  const blockers = providerKeyBlockers(result, expectedSlugs);
  if (blockers.length > 0) return blockers;

  const providerMap = result as ReadonlyMap<string, unknown>;
  for (const slug of expectedSlugs) {
    if (!validateTypedVerdict(providerMap.get(slug))) {
      blockers.push({ code: "provider-malformed", locus: `readiness-provider:${slug}` });
    }
  }
  return blockers;
}

class ProviderContractError extends Error {
  constructor(readonly blockers: readonly DecomposeLaunchBlocker[]) {
    super("readiness provider violated its closed batch contract");
  }
}

function recordRefusals(input: ResolveLaunchReadinessInput): DecomposeLaunchBlocker[] {
  const blockers: DecomposeLaunchBlocker[] = [];
  if (input.composition.indeterminate) {
    blockers.push({ code: "composition-indeterminate", locus: "project-readiness-composition" });
  }
  for (const rejected of input.composition.rejectedRecords) {
    if (rejected.slugHint !== null && rejected.slugHint !== input.slug) continue;
    blockers.push({
      code: `record-${rejected.reason}`,
      locus: `${rejected.path}:${rejected.locus}`,
    });
  }
  return blockers;
}

/**
 * Adapt the existing public project-view provider to the typed decomposition socket.
 *
 * @param provider - Existing batch project-readiness provider.
 * @returns A typed provider that preserves the original single batch call.
 */
export function adaptProjectReadinessProvider(
  provider: ProjectReadinessProvider,
): DecomposeReadinessProvider {
  return {
    resolve({ candidates }) {
      const verdicts = provider.resolve(candidates.map(({ record }) => record));
      const expected = new Set(candidates.map(({ slug }) => slug));
      const keyBlockers = providerKeyBlockers(verdicts, expected);
      if (keyBlockers.length > 0) throw new ProviderContractError(keyBlockers);

      const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]));
      const adapted = new Map<string, DecomposeReadinessVerdict>();
      for (const slug of expected) {
        const verdict = verdicts.get(slug);
        if (verdict === "ready") {
          adapted.set(slug, { kind: "ready" });
        } else if (verdict === "blocked") {
          const candidate = bySlug.get(slug);
          adapted.set(slug, {
            kind: "blocked",
            blockers: [{
              code: "provider-blocked",
              locus: `${candidate?.record.source.path ?? slug}:provider`,
            }],
          });
        } else {
          throw new ProviderContractError([{
            code: "provider-malformed",
            locus: `readiness-provider:${slug}`,
          }]);
        }
      }
      return adapted;
    },
  };
}

/** Production readiness bundle shared by decomposition launch consumers. */
export const decomposeReadinessDeps: DecomposeReadinessDeps = {
  readinessProvider: adaptProjectReadinessProvider(depsOnlyReadinessProvider),
};

/**
 * Resolve one slug's launch readiness from a pinned project composition.
 *
 * @param input - Requested slug, lossless composition, and required provider bundle.
 * @returns A closed ready, blocked, or refused result with exact loci.
 */
export function resolveLaunchReadiness(
  input: ResolveLaunchReadinessInput,
): DecomposeLaunchReadiness {
  const structuralRefusals = recordRefusals(input);
  const matches = input.composition.acceptedCandidates.filter(({ slug }) => slug === input.slug);
  if (matches.length === 0) {
    structuralRefusals.push({ code: "record-missing", locus: `project-record:${input.slug}` });
  } else if (matches.length > 1) {
    structuralRefusals.push(...matches.map(({ path }) => ({ code: "record-duplicate" as const, locus: path })));
  }
  if (structuralRefusals.length > 0) return refused(structuralRefusals);

  const target = matches[0];
  if (target === undefined) return refused([{ code: "record-missing", locus: `project-record:${input.slug}` }]);
  if (target.lifecycleLocation !== "planned") {
    return refused([{ code: "record-wrong-lifecycle", locus: target.path }]);
  }
  if (target.record.state !== "Planning") {
    return refused([{ code: "record-wrong-state", locus: `${target.path}:State` }]);
  }

  const candidates = providerCandidates(input.composition);
  const provider = (input.deps as Partial<DecomposeReadinessDeps>).readinessProvider;
  if (provider === undefined) {
    return refused([{ code: "provider-missing", locus: "readiness-provider" }]);
  }

  let providerResult: unknown;
  try {
    providerResult = provider.resolve({ candidates, composition: input.composition });
  } catch (error) {
    if (error instanceof ProviderContractError) return refused(error.blockers);
    return refused([{ code: "provider-failed", locus: "readiness-provider" }]);
  }
  const providerRefusals = providerContractBlockers(
    providerResult,
    new Set(input.composition.acceptedCandidates.map(({ slug }) => slug)),
  );
  if (providerRefusals.length > 0) return refused(providerRefusals);

  const blockers: DecomposeLaunchBlocker[] = [];
  if (target.record.scheduling === "parked") {
    blockers.push({ code: "record-parked", locus: `${target.path}:scheduling` });
  }
  const targetProvider = (providerResult as ReadonlyMap<string, DecomposeReadinessVerdict>).get(input.slug);
  for (const fact of candidates.find(({ slug }) => slug === input.slug)?.dependencyFacts ?? []) {
    if (!fact.satisfied) blockers.push({ code: dependencyCode(fact.state), locus: fact.locus });
  }
  if (targetProvider?.kind === "blocked") blockers.push(...targetProvider.blockers);

  return blockers.length === 0 ? { kind: "ready" } : { kind: "blocked", blockers };
}
