/**
 * Finalization-time validation of preparation-bound decomposition topology.
 *
 * The pure topology planner is rerun only against the supplied candidate tree.
 * Its result may confirm stored paths and structural identity, but never replaces
 * the preparation's logical anchor, topology facts, or digest.
 *
 * @module
 */

import {
  checkCohortConsistency,
  type CohortConsistencyInput,
} from "../active/cohort-consistency.js";
import { canonicalize } from "../canonical/canonical-json.js";
import {
  parseV3DecomposePreparation,
  projectV3CandidateAuthority,
  type V3TopologyFact,
} from "./decompose-v3-preparation.js";
import {
  planV3DecomposeTopology,
  type V3TopologyAction,
  type V3TopologyPlanInput,
  type V3TopologyTreeState,
} from "./decompose-v3-topology.js";

/** Closed mismatch classes returned before finalization policy is available. */
export type V3DecomposeTopologyValidationIssueCode =
  | "preparation-invalid"
  | "topology-document-missing"
  | "topology-planner-mismatch"
  | "stored-topology-mismatch"
  | "cohort-consistency"
  | "topology-purpose-incomplete";

/** One exact topology or coordination refusal. */
export interface V3DecomposeTopologyValidationIssue {
  code: V3DecomposeTopologyValidationIssueCode;
  path?: string;
  detail?: string;
}

/** Inputs for validating one materialized candidate's stored topology. */
export interface ValidateV3DecomposeTopologyInput {
  preparation: unknown;
  candidateTree: V3TopologyPlanInput["baseTree"];
  cohortTemplate: Uint8Array;
  cohortConsistency: CohortConsistencyInput;
}

/** Closed stored-topology validation result. */
export type ValidateV3DecomposeTopologyResult =
  | { status: "validated"; topologyPaths: readonly string[] }
  | { status: "refused"; issues: readonly V3DecomposeTopologyValidationIssue[] };

function storedTopologyPaths(facts: readonly V3TopologyFact[]): string[] {
  return facts.flatMap((fact) => fact.kind === "none" ? [] : [fact.path]);
}

function currentActionPath(action: V3TopologyAction): string | undefined {
  return action.kind === "none" ? undefined : action.path;
}

function currentActionConfirmsStored(storedKind: string, currentKind: V3TopologyAction["kind"]): boolean {
  switch (storedKind) {
    case "none":
      return currentKind === "none";
    case "create":
    case "reuse":
      return currentKind === "reuse";
    case "backfill":
    case "ensure":
      return currentKind === "ensure";
    case "append":
      return currentKind === "reuse";
    default:
      return false;
  }
}

function containsIncompletePurpose(state: Exclude<V3TopologyTreeState, { kind: "absent" }>): boolean {
  if (state.objectKind !== "blob") return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(state.bytes);
  } catch {
    return false;
  }
  return text.split(/\r?\n/u).some((line) => line.trim() === "**Purpose:** —");
}

/**
 * Validate candidate topology without deriving replacement authority.
 *
 * @param input - Canonical preparation candidate, exact candidate topology
 * states, template bytes, and generic cohort-consistency universe.
 * @returns Validated stored paths or typed mismatches with exact loci.
 */
export function validateV3DecomposeTopology(
  input: ValidateV3DecomposeTopologyInput,
): ValidateV3DecomposeTopologyResult {
  const preparation = parseV3DecomposePreparation(input.preparation);
  if (preparation === null) {
    return { status: "refused", issues: [{ code: "preparation-invalid" }] };
  }

  const storedFacts = preparation.facts.topology.facts;
  const topologyPaths = storedTopologyPaths(storedFacts);
  for (const path of topologyPaths) {
    if (input.candidateTree[path] === undefined) {
      return { status: "refused", issues: [{ code: "topology-document-missing", path }] };
    }
  }

  const map = preparation.facts.completedMap;
  const planned = planV3DecomposeTopology({
    origin: map.machine.source.origin,
    placement: map.authoring.placement,
    destinations: map.authoring.destinations,
    baseTree: input.candidateTree,
    cohortTemplate: input.cohortTemplate,
  });
  if (planned.status === "refused") {
    return {
      status: "refused",
      issues: [{
        code: "topology-planner-mismatch",
        ...(planned.refusal.path === undefined ? {} : { path: planned.refusal.path }),
        detail: planned.refusal.code,
      }],
    };
  }

  const projected = projectV3CandidateAuthority(map, planned.plan);
  if (projected.status === "refused"
    || canonicalize(projected.authority.candidatePublication)
      !== canonicalize(preparation.facts.candidatePublication)
    || planned.plan.actions.length !== storedFacts.length) {
    return { status: "refused", issues: [{ code: "stored-topology-mismatch" }] };
  }
  for (const [index, stored] of storedFacts.entries()) {
    const current = planned.plan.actions[index];
    const storedPath = stored.kind === "none" ? undefined : stored.path;
    if (current === undefined
      || storedPath !== currentActionPath(current)
      || !currentActionConfirmsStored(stored.kind, current.kind)) {
      return {
        status: "refused",
        issues: [{
          code: "stored-topology-mismatch",
          ...(storedPath === undefined ? {} : { path: storedPath }),
        }],
      };
    }
  }

  const consistency = checkCohortConsistency(input.cohortConsistency);
  if (consistency.length > 0) {
    return {
      status: "refused",
      issues: consistency.map((detail) => ({ code: "cohort-consistency", detail })),
    };
  }

  for (const path of topologyPaths) {
    const state = input.candidateTree[path];
    if (state !== undefined && containsIncompletePurpose(state)) {
      return { status: "refused", issues: [{ code: "topology-purpose-incomplete", path }] };
    }
  }

  return { status: "validated", topologyPaths };
}
