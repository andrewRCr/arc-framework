/**
 * Encoding-consistency validator for the meta `Current Workflow` field — the
 * write-side drift guard.
 *
 * `Current Workflow` is a code-owned, single-owner field: the lifecycle executor
 * writes it at each planning-stage transition, session-init reads it to resolve
 * the planning sub-stage, and nothing hand-edits it. This validator asserts the
 * field agrees with the rest of the meta state across the
 * `(State, Current Workflow, Design)` tuple, so a stale or mistyped value is
 * caught rather than silently mis-resolving a sub-stage:
 *
 *  - Under `State: Planning`, `Current Workflow` names one of the three planning
 *    stages and agrees with the `Design` pointer per the event-driven repoint
 *    model — `draft-design` / `create-spec` keep `Design` on the draft (or
 *    `[none]` before one exists), and the `draft → spec` repoint rides
 *    create-spec finalization, so `generate-tasks` implies a `spec-*` `Design`.
 *  - Under any non-planning state, `Current Workflow` is `[none]` (or absent on a
 *    legacy meta) — a live workflow value there is stale planning drift.
 *
 * Pure over its parsed-tuple input (no fs/git side effects): callers parse the
 * meta and pass the three field values. Mirrors {@link checkCohortConsistency}'s
 * diagnostics contract — one string per inconsistency, an empty array when
 * consistent.
 *
 * @module
 */

import { parseIdentifierList } from "./meta-reader.js";

/** The State value under which `Current Workflow` is meaningful. */
const PLANNING_STATE = "Planning";

/** The out-of-planning / absent-pointer sentinel. */
const NONE_SENTINEL = "[none]";

/** The closed set of planning-stage `Current Workflow` values, in stage order. */
export const PLANNING_WORKFLOWS = ["draft-design", "create-spec", "generate-tasks"] as const;

/**
 * The `Next Action` boundary sentinel — "begin the workflow named in `Current Workflow`". A *relative* pointer: it
 * resolves against whatever `Current Workflow` currently names, so it stays correct as the stage advances and is
 * never a duplicated workflow filename. Written at a clean stage boundary (the scaffold seed and each
 * finalization-advance); within a stage `Next Action` carries free-form within-stage judgment instead.
 */
export const BEGIN_CURRENT_WORKFLOW_SENTINEL = "[begin current workflow]";

/** A single planning-stage workflow basename. */
export type PlanningWorkflow = (typeof PLANNING_WORKFLOWS)[number];

/**
 * The parsed `(State, Current Workflow, Design)` tuple the validator reasons
 * over — bare field values as recovered by `parseMetaRecord` (backticks
 * stripped; bracket sentinels and a marker-absent `null` preserved).
 */
export interface CurrentWorkflowConsistencyInput {
  /** The meta `State` value, e.g. `Planning` / `Active`; `null` when absent. */
  state: string | null;
  /** The meta `Current Workflow` value; `[none]` / `null` when unset/absent. */
  currentWorkflow: string | null;
  /** The meta `Design` value (single or comma-separated list); `[none]` / `null` when unset. */
  design: string | null;
}

/** Whether `value` is one of the three planning-stage workflow basenames. */
export function isPlanningWorkflow(value: string | null): value is PlanningWorkflow {
  return value !== null && (PLANNING_WORKFLOWS as readonly string[]).includes(value);
}

/**
 * Run the encoding-consistency invariant over the parsed tuple, returning one
 * diagnostic per inconsistency. An empty array means `Current Workflow` is
 * consistent with the rest of the meta state.
 */
export function checkCurrentWorkflowConsistency(input: CurrentWorkflowConsistencyInput): string[] {
  const diagnostics: string[] = [];
  const { state, currentWorkflow, design } = input;

  if (state !== PLANNING_STATE) {
    // Outside planning, the field must be the [none] sentinel (or absent on a
    // legacy meta). A live planning-stage value here is stale drift.
    if (currentWorkflow !== null && currentWorkflow !== NONE_SENTINEL) {
      diagnostics.push(
        `Current Workflow "${currentWorkflow}" is set under non-planning State ` +
          `"${state ?? "(absent)"}" (must be "${NONE_SENTINEL}" outside State: ${PLANNING_STATE})`,
      );
    }
    return diagnostics;
  }

  // State: Planning — the field must name a planning stage...
  if (!isPlanningWorkflow(currentWorkflow)) {
    diagnostics.push(
      `Current Workflow "${currentWorkflow ?? "(absent)"}" is not a planning stage under ` +
        `State: ${PLANNING_STATE} (expected one of ${PLANNING_WORKFLOWS.join(", ")})`,
    );
    return diagnostics; // stage unknown — Design agreement is not checkable
  }

  // ...and agree with the Design pointer per the event-driven repoint model.
  const designElements = parseIdentifierList(design);
  const designNone = designElements.length === 0;
  const allDraft = designElements.length > 0 && designElements.every((d) => d.startsWith("draft-"));
  const allSpec = designElements.length > 0 && designElements.every((d) => d.startsWith("spec-"));
  const designDisplay = design ?? "(absent)";

  if (currentWorkflow === "generate-tasks") {
    // The draft → spec repoint has fired (it rides create-spec finalization).
    if (!allSpec) {
      diagnostics.push(
        `Current Workflow "generate-tasks" requires Design to point at a spec-* artifact, ` +
          `but Design is "${designDisplay}"`,
      );
    }
  } else {
    // draft-design / create-spec — Design is the draft, or [none] before one
    // exists; it has not yet been repointed to the spec.
    if (!designNone && !allDraft) {
      diagnostics.push(
        `Current Workflow "${currentWorkflow}" requires Design to point at a draft-* artifact ` +
          `(or "${NONE_SENTINEL}"), but Design is "${designDisplay}"`,
      );
    }
  }

  return diagnostics;
}
