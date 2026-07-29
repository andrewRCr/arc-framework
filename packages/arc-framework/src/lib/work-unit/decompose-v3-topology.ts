/** Pure logical-anchor and constitutive-topology planning for v3 decomposition. */

import { resolveArcPath } from "../layout/index.js";
import { SlugSchema, type Slug } from "../kernel/index.js";
import type { V3DecomposeCutMap } from "./decompose-v3-schema.js";

export type V3TopologyTreeState =
  | { kind: "absent" }
  | {
    kind: "object";
    objectKind: string;
    mode: string;
    bytes: Uint8Array;
  };

export type V3TopologyLogicalAnchor =
  | { kind: "direct-member"; slug: string }
  | { kind: "cohort"; cohort: string }
  | { kind: "subcohort"; cohort: string }
  | { kind: "at-cap-fanout"; parent: string; origin: string };

export type V3TopologyAction =
  | { kind: "none" }
  | {
    kind: "create" | "ensure" | "backfill" | "reuse" | "append";
    path: string;
    before: V3TopologyTreeState;
    after: V3TopologyTreeState;
  };

export interface V3TopologyPlan {
  logicalAnchor: V3TopologyLogicalAnchor;
  constituents: string[];
  actions: V3TopologyAction[];
}

export type V3TopologyRefusalCode =
  | "no-new-member"
  | "multi-member-cohortless"
  | "placement-member-count"
  | "unexpected-coordination-location"
  | "missing-parent"
  | "nonregular-topology-path"
  | "invalid-topology-utf8"
  | "wrong-structural-identity"
  | "invalid-cohort-template"
  | "conflicting-at-cap-provenance";

export type V3TopologyPlanResult =
  | { status: "planned"; plan: V3TopologyPlan }
  | { status: "refused"; refusal: { code: V3TopologyRefusalCode; path?: string } };

type Destination = V3DecomposeCutMap["authoring"]["destinations"][number];
type Placement = V3DecomposeCutMap["authoring"]["placement"];

export interface V3TopologyPlanInput {
  origin: string;
  placement: Placement;
  destinations: Destination[];
  baseTree: Record<string, Exclude<V3TopologyTreeState, { kind: "absent" }>>;
  cohortTemplate: Uint8Array;
}

export interface V3InternalTopologyPlanInput extends V3TopologyPlanInput {
  survivingOrigin?: string;
}

const ABSENT = { kind: "absent" } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/** Project one canonical cohort identity to its planned coordination-document path. */
export function v3CohortDocumentPath(cohort: string): string {
  const raw = cohort.split("/");
  const cohortSegments: [Slug] | [Slug, Slug] = raw.length === 1
    ? [SlugSchema.parse(raw[0])]
    : [SlugSchema.parse(raw[0]), SlugSchema.parse(raw[1])];
  return resolveArcPath({
    kind: "cohort-document",
    placement: { kind: "planned" },
    cohort: cohortSegments,
  });
}

function readState(input: V3InternalTopologyPlanInput, path: string): V3TopologyTreeState {
  return input.baseTree[path] ?? ABSENT;
}

function fileState(bytes: Uint8Array): Exclude<V3TopologyTreeState, { kind: "absent" }> {
  return { kind: "object", objectKind: "blob", mode: "100644", bytes };
}

function existingText(
  state: V3TopologyTreeState,
  path: string,
): { status: "accepted"; text: string } | {
  status: "refused";
  refusal: { code: V3TopologyRefusalCode; path: string };
} {
  if (state.kind !== "object"
    || state.objectKind !== "blob"
    || (state.mode !== "100644" && state.mode !== "100755")) {
    return { status: "refused", refusal: { code: "nonregular-topology-path", path } };
  }
  try {
    return { status: "accepted", text: decoder.decode(state.bytes) };
  } catch {
    return { status: "refused", refusal: { code: "invalid-topology-utf8", path } };
  }
}

function structurallyMatches(text: string, cohort: string): boolean {
  const segments = cohort.split("/");
  const leaf = segments.at(-1);
  const parent = segments.length === 2 ? segments[0] : null;
  if (leaf === undefined || !text.startsWith(`# Cohort: \`${leaf}\`\n`)) return false;
  const parentLines = [...text.matchAll(/^\*\*Parent:\*\* (.+)$/gmu)].map((match) => match[1]);
  return parent === null
    ? parentLines.length === 0
    : parentLines.length === 1 && parentLines[0] === parent;
}

/**
 * Render the canonical template's identity floor as an explicitly incomplete cohort document.
 *
 * @param template - Exact package-source `template-cohort.md` bytes.
 * @param cohort - Canonical one- or two-segment cohort path.
 * @returns Minimal canonical bytes with the `Purpose: —` finalization sentinel, or null on template drift.
 */
export function renderV3IncompleteCohort(
  template: Uint8Array,
  cohort: string,
): Uint8Array | null {
  let source: string;
  try {
    source = decoder.decode(template).replaceAll("\r\n", "\n");
  } catch {
    return null;
  }
  const heading = "# Cohort: `{cohort-name}`\n";
  const parentStart = source.indexOf("**Parent:** {");
  const purposeStart = source.indexOf("**Purpose:** {");
  if (!source.startsWith(heading) || parentStart < heading.length || purposeStart <= parentStart) return null;
  const identity = source.slice(heading.length, parentStart);
  const segments = cohort.split("/");
  const leaf = segments.at(-1);
  if (leaf === undefined || segments.length < 1 || segments.length > 2) return null;
  const parent = segments.length === 2 ? `**Parent:** ${segments[0]}\n\n` : "";
  return encoder.encode(`# Cohort: \`${leaf}\`\n${identity}${parent}**Purpose:** —\n\n---\n`);
}

function renderCohort(
  cohortTemplate: Uint8Array,
  cohort: string,
): { status: "accepted"; state: Exclude<V3TopologyTreeState, { kind: "absent" }> } | {
  status: "refused";
  refusal: { code: V3TopologyRefusalCode };
} {
  const bytes = renderV3IncompleteCohort(cohortTemplate, cohort);
  return bytes === null
    ? { status: "refused", refusal: { code: "invalid-cohort-template" } }
    : { status: "accepted", state: fileState(bytes) };
}

function planCohortPath(
  input: V3InternalTopologyPlanInput,
  cohort: string,
  missingKind: "create" | "backfill",
  presentKind: "reuse" | "ensure",
): V3TopologyAction | { refusal: { code: V3TopologyRefusalCode; path?: string } } {
  const path = v3CohortDocumentPath(cohort);
  const before = readState(input, path);
  if (before.kind === "absent") {
    const rendered = renderCohort(input.cohortTemplate, cohort);
    return rendered.status === "refused"
      ? { refusal: rendered.refusal }
      : { kind: missingKind, path, before, after: rendered.state };
  }
  const existing = existingText(before, path);
  if (existing.status === "refused") return { refusal: existing.refusal };
  if (!structurallyMatches(existing.text, cohort)) {
    return { refusal: { code: "wrong-structural-identity", path } };
  }
  return { kind: presentKind, path, before, after: before };
}

function fanoutBlock(origin: string, constituents: string[]): string {
  return [
    `<!-- arc:decompose-fanout:${origin}:start -->`,
    `### \`${origin}\` decomposition fan-out`,
    "",
    ...constituents.map((slug) => `- \`${slug}\``),
    `<!-- arc:decompose-fanout:${origin}:end -->`,
  ].join("\n");
}

function appendBeforeFinalRule(text: string, block: string): string {
  const finalRule = text.lastIndexOf("\n---");
  if (finalRule < 0) return `${text.trimEnd()}\n\n${block}\n`;
  return `${text.slice(0, finalRule).trimEnd()}\n\n${block}\n${text.slice(finalRule)}`
    .replace(/\n*$/u, "\n");
}

function planAtCap(
  input: V3InternalTopologyPlanInput,
  parent: string,
  constituents: string[],
): V3TopologyAction | { refusal: { code: V3TopologyRefusalCode; path?: string } } {
  const path = v3CohortDocumentPath(parent);
  const before = readState(input, path);
  if (before.kind === "absent") return { refusal: { code: "missing-parent", path } };
  const existing = existingText(before, path);
  if (existing.status === "refused") return { refusal: existing.refusal };
  if (!structurallyMatches(existing.text, parent)) {
    return { refusal: { code: "wrong-structural-identity", path } };
  }
  const block = fanoutBlock(input.origin, constituents);
  if (existing.text.includes(block)) return { kind: "reuse", path, before, after: before };
  const start = `<!-- arc:decompose-fanout:${input.origin}:start -->`;
  const end = `<!-- arc:decompose-fanout:${input.origin}:end -->`;
  if (existing.text.includes(start) || existing.text.includes(end)) {
    return { refusal: { code: "conflicting-at-cap-provenance", path } };
  }
  return {
    kind: "append",
    path,
    before,
    after: { ...before, bytes: encoder.encode(appendBeforeFinalRule(existing.text, block)) },
  };
}

function coordinationMatches(placement: Placement, destinations: Destination[]): boolean {
  const coordination = destinations.filter((destination) => destination.kind === "cohort-coordination");
  if (placement.kind === "direct-member") return coordination.length === 0;
  const expected = placement.kind === "at-cap" ? placement.parent : placement.cohort;
  return coordination.every((destination) => destination.cohort === expected);
}

function planTopology(input: V3InternalTopologyPlanInput): V3TopologyPlanResult {
  const newMembers = input.destinations
    .filter((destination): destination is Extract<Destination, { kind: "new-member" }> =>
      destination.kind === "new-member")
    .map(({ slug }) => slug)
    .sort(compareUtf8);
  if (newMembers.length === 0) {
    return { status: "refused", refusal: { code: "no-new-member" } };
  }
  const constituents = input.survivingOrigin === undefined
    ? newMembers
    : [...newMembers, input.survivingOrigin].sort(compareUtf8);
  if (!coordinationMatches(input.placement, input.destinations)) {
    return { status: "refused", refusal: { code: "unexpected-coordination-location" } };
  }
  if (input.placement.kind === "direct-member") {
    if (constituents.length !== 1) {
      return { status: "refused", refusal: { code: "multi-member-cohortless" } };
    }
    const slug = constituents[0];
    if (slug === undefined) return { status: "refused", refusal: { code: "no-new-member" } };
    return {
      status: "planned",
      plan: {
        logicalAnchor: { kind: "direct-member", slug },
        constituents,
        actions: [{ kind: "none" }],
      },
    };
  }
  if (constituents.length < 2) {
    return { status: "refused", refusal: { code: "placement-member-count" } };
  }

  const actions: V3TopologyAction[] = [];
  let logicalAnchor: V3TopologyLogicalAnchor;
  if (input.placement.kind === "cohort") {
    logicalAnchor = { kind: "cohort", cohort: input.placement.cohort };
    const action = planCohortPath(input, input.placement.cohort, "create", "reuse");
    if ("refusal" in action) return { status: "refused", refusal: action.refusal };
    actions.push(action);
  } else if (input.placement.kind === "subcohort") {
    logicalAnchor = { kind: "subcohort", cohort: input.placement.cohort };
    const parent = input.placement.cohort.split("/")[0];
    if (parent === undefined) {
      return { status: "refused", refusal: { code: "wrong-structural-identity" } };
    }
    const parentPath = v3CohortDocumentPath(parent);
    const cohortPath = v3CohortDocumentPath(input.placement.cohort);
    if (readState(input, parentPath).kind === "absent"
      && readState(input, cohortPath).kind !== "absent") {
      return {
        status: "refused",
        refusal: { code: "wrong-structural-identity", path: parentPath },
      };
    }
    const parentAction = planCohortPath(input, parent, "backfill", "ensure");
    if ("refusal" in parentAction) return { status: "refused", refusal: parentAction.refusal };
    const cohortAction = planCohortPath(input, input.placement.cohort, "create", "reuse");
    if ("refusal" in cohortAction) return { status: "refused", refusal: cohortAction.refusal };
    actions.push(parentAction, cohortAction);
  } else {
    logicalAnchor = {
      kind: "at-cap-fanout",
      parent: input.placement.parent,
      origin: input.origin,
    };
    const action = planAtCap(input, input.placement.parent, constituents);
    if ("refusal" in action) return { status: "refused", refusal: action.refusal };
    actions.push(action);
  }
  return { status: "planned", plan: { logicalAnchor, constituents, actions } };
}

/**
 * Plan the public core topology, counting only newly minted members.
 *
 * @param input - Decided placement, destinations, exact base states, and canonical cohort template.
 * @returns One logical anchor and ordered topology actions, or a closed refusal.
 */
export function planV3DecomposeTopology(input: V3TopologyPlanInput): V3TopologyPlanResult {
  return planTopology(input);
}

/**
 * Plan topology for an internal extraction consumer that may retain the origin as a constituent.
 *
 * @param input - Core topology input plus the optional surviving-origin identity.
 * @returns The same closed plan shape without widening the public cut-map codec.
 */
export function planInternalV3DecomposeTopology(
  input: V3InternalTopologyPlanInput,
): V3TopologyPlanResult {
  return planTopology(input);
}
