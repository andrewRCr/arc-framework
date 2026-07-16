/**
 * Versioned decompose allocation-map vocabulary and boundary validation.
 *
 * The allocation map is a complete machine contract: destinations, source-unit
 * dispositions, and dependency-edge dispositions are closed typed sets. This
 * module validates untrusted decoded JSON before any lifecycle mutation.
 */

import type { WorkClass, WorkUnitState } from "../../commands/active/types.js";
import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import {
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { normalizeDecomposeHeadingSource } from "./decompose-heading.js";
import { isSlugSafe } from "./slug.js";

export const DECOMPOSE_SCHEMA_VERSION = 2;

export type TransformShape = "symmetric" | "extraction" | "backlog-stub-source" | "heterogeneous-home";
export type ParentPosition = "standalone" | "in-cohort" | "at-cap";
export type OriginLocation = "provisional" | "planned" | "active";
export type OriginDisposition = "keep-active" | "park";
export type ExistingHomeKind = "fold" | "atomic-edit";
export type DecomposeSourceOwnership = "destination-owned" | "cohort-shared";

export interface OriginPosition {
  slug: string;
  phase: WorkUnitState;
  location: OriginLocation;
}

export type DecomposeEdgeDisposition =
  | { kind: "targets"; targets: string[] }
  | { kind: "drop"; reason: string };

export type DecomposeIncomingEdgeDisposition =
  | { kind: "replace"; replacementTargets: string[] }
  | { kind: "drop"; reason: string };

export type DecomposeContentLocator =
  | { artifact: string; kind: "preamble" }
  | { artifact: string; kind: "section"; headingSource: string; occurrence: number }
  | { artifact: string; kind: "whole-file" };

export type DecomposeSourceDisposition =
  | { kind: "target"; destinationId: string; targetLocator: DecomposeContentLocator }
  | { kind: "drop"; reason: string };

export type DecomposeExistingTarget =
  | { kind: "work-unit"; slug: string }
  | { kind: "draft-block"; slug: string; locator: DecomposeContentLocator }
  | { kind: "document"; path: string };

export interface NewMemberEntry {
  kind: "new-member";
  destinationId: string;
  slug: string;
  workClass: WorkClass;
}

export interface SurvivingOriginEntry {
  kind: "surviving-origin";
  destinationId: string;
  slug: string;
  disposition: OriginDisposition;
}

export interface ExistingHomeEntry {
  kind: "existing-home";
  destinationId: string;
  target: DecomposeExistingTarget;
  home: ExistingHomeKind;
}

export interface CohortCoordinationEntry {
  kind: "cohort-coordination";
  destinationId: string;
  cohort: string;
}

export type DecomposeAllocationEntry =
  | NewMemberEntry
  | SurvivingOriginEntry
  | ExistingHomeEntry
  | CohortCoordinationEntry;
export type CutEntry = DecomposeAllocationEntry;

export interface InternalEdge {
  from: string;
  to: string;
}

export interface DecomposeAllocationMap {
  schemaVersion: typeof DECOMPOSE_SCHEMA_VERSION;
  origin: OriginPosition;
  shape: TransformShape;
  parentPosition: ParentPosition;
  cohort?: string;
  entries: DecomposeAllocationEntry[];
  internalEdges: InternalEdge[];
  sourceAllocations: Array<{
    sourceId: CanonicalDigest;
    ownership: DecomposeSourceOwnership;
    disposition: DecomposeSourceDisposition;
  }>;
  incomingEdges: Array<{ dependent: string; disposition: DecomposeIncomingEdgeDisposition }>;
  outgoingEdges: Array<{ prerequisite: string; disposition: DecomposeEdgeDisposition }>;
}

/** Compatibility name retained for the executor and command boundary. */
export type DecomposeParams = DecomposeAllocationMap;

export type CutMapParseResult =
  | { status: "rejected"; reason: string }
  | { status: "parsed"; params: DecomposeAllocationMap };

const TRANSFORM_SHAPES: readonly TransformShape[] = [
  "symmetric",
  "extraction",
  "backlog-stub-source",
  "heterogeneous-home",
];
const PARENT_POSITIONS: readonly ParentPosition[] = ["standalone", "in-cohort", "at-cap"];
const ORIGIN_LOCATIONS: readonly OriginLocation[] = ["provisional", "planned", "active"];
const ORIGIN_PHASES: readonly WorkUnitState[] = ["Planning", "Active"];
const WORK_CLASSES: readonly WorkClass[] = ["Light", "Heavy", "Novel"];
const ORIGIN_DISPOSITIONS: readonly OriginDisposition[] = ["keep-active", "park"];
const EXISTING_HOME_KINDS: readonly ExistingHomeKind[] = ["fold", "atomic-edit"];

type Parsed<T> = { value: T } | { reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIn<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): string | null {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  return unknown === undefined ? null : `${label} has unknown field \`${unknown}\`.`;
}

function safeSlug(value: unknown): value is string {
  return isNonEmptyString(value) && isSlugSafe(value);
}

function duplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function sortedStrings(values: readonly string[]): string[] {
  return sortByCanonicalBytes(values);
}

function compareCanonicalStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function parseLocator(raw: unknown, label: string): Parsed<DecomposeContentLocator> {
  if (!isObject(raw)) return { reason: `${label} must be an object.` };
  if (!isNonEmptyString(raw.artifact) || raw.artifact.includes("/") || raw.artifact.includes("\\")
    || raw.artifact === "." || raw.artifact === ".." || raw.artifact.includes("\0")
    || raw.artifact.normalize("NFC") !== raw.artifact) {
    return { reason: `${label}.artifact must be a slash-free NFC basename.` };
  }
  if (raw.kind === "preamble" || raw.kind === "whole-file") {
    const keyError = exactKeys(raw, ["artifact", "kind"], label);
    if (keyError !== null) return { reason: keyError };
    return { value: { artifact: raw.artifact, kind: raw.kind } };
  }
  if (raw.kind === "section") {
    const keyError = exactKeys(raw, ["artifact", "kind", "headingSource", "occurrence"], label);
    if (keyError !== null) return { reason: keyError };
    if (typeof raw.headingSource !== "string"
      || normalizeDecomposeHeadingSource(raw.headingSource) !== raw.headingSource) {
      return { reason: `${label}.headingSource must be normalized.` };
    }
    if (!Number.isInteger(raw.occurrence) || (raw.occurrence as number) < 0) {
      return { reason: `${label}.occurrence must be a non-negative integer.` };
    }
    return {
      value: {
        artifact: raw.artifact,
        kind: "section",
        headingSource: raw.headingSource,
        occurrence: raw.occurrence as number,
      },
    };
  }
  return { reason: `${label}.kind must be \`preamble\`, \`section\`, or \`whole-file\`.` };
}

/** Decode one closed, normalized content locator at an untrusted boundary. */
export function parseDecomposeContentLocator(input: unknown): DecomposeContentLocator | null {
  const parsed = parseLocator(input, "content locator");
  return "reason" in parsed ? null : parsed.value;
}

/** Derive the exact dependency list scaffolded for one new member. */
export function newMemberDependencies(
  map: Pick<DecomposeAllocationMap, "internalEdges" | "outgoingEdges">,
  slug: string,
): string[] {
  const dependencies = map.outgoingEdges
    .filter((edge) => edge.disposition.kind === "targets" && edge.disposition.targets.includes(slug))
    .map((edge) => edge.prerequisite);
  for (const edge of map.internalEdges) {
    if (edge.from === slug && !dependencies.includes(edge.to)) dependencies.push(edge.to);
  }
  return dependencies;
}

function parseExistingTarget(raw: unknown, label: string): Parsed<DecomposeExistingTarget> {
  if (!isObject(raw)) return { reason: `${label} must be an object.` };
  if (raw.kind === "work-unit") {
    const keyError = exactKeys(raw, ["kind", "slug"], label);
    if (keyError !== null) return { reason: keyError };
    if (!safeSlug(raw.slug)) return { reason: `${label}.slug must be slug-safe.` };
    return { value: { kind: "work-unit", slug: raw.slug } };
  }
  if (raw.kind === "draft-block") {
    const keyError = exactKeys(raw, ["kind", "slug", "locator"], label);
    if (keyError !== null) return { reason: keyError };
    if (!safeSlug(raw.slug)) return { reason: `${label}.slug must be slug-safe.` };
    const locator = parseLocator(raw.locator, `${label}.locator`);
    if ("reason" in locator) return locator;
    return { value: { kind: "draft-block", slug: raw.slug, locator: locator.value } };
  }
  if (raw.kind === "document") {
    const keyError = exactKeys(raw, ["kind", "path"], label);
    if (keyError !== null) return { reason: keyError };
    if (!isNonEmptyString(raw.path) || !isManagedPath(raw.path)) {
      return { reason: `${label}.path must be a managed repository-relative path.` };
    }
    return { value: { kind: "document", path: raw.path } };
  }
  return { reason: `${label}.kind must be \`work-unit\`, \`draft-block\`, or \`document\`.` };
}

function parseEntry(raw: unknown, index: number): Parsed<DecomposeAllocationEntry> {
  const label = `entry ${index}`;
  if (!isObject(raw)) return { reason: `${label} must be an object.` };
  if (!isNonEmptyString(raw.destinationId)) return { reason: `${label}.destinationId must be non-empty.` };

  if (raw.kind === "new-member") {
    const keyError = exactKeys(raw, ["kind", "destinationId", "slug", "workClass"], label);
    if (keyError !== null) return { reason: keyError };
    if (!safeSlug(raw.slug)) return { reason: `${label}.slug must be slug-safe.` };
    if (!isIn(raw.workClass, WORK_CLASSES)) return { reason: `${label}.workClass requires a resolved Class.` };
    return { value: { kind: "new-member", destinationId: raw.destinationId, slug: raw.slug, workClass: raw.workClass } };
  }
  if (raw.kind === "surviving-origin") {
    const keyError = exactKeys(raw, ["kind", "destinationId", "slug", "disposition"], label);
    if (keyError !== null) return { reason: keyError };
    if (!safeSlug(raw.slug)) return { reason: `${label}.slug must be slug-safe.` };
    if (!isIn(raw.disposition, ORIGIN_DISPOSITIONS)) return { reason: `${label}.disposition is invalid.` };
    return {
      value: {
        kind: "surviving-origin",
        destinationId: raw.destinationId,
        slug: raw.slug,
        disposition: raw.disposition,
      },
    };
  }
  if (raw.kind === "existing-home") {
    const keyError = exactKeys(raw, ["kind", "destinationId", "target", "home"], label);
    if (keyError !== null) return { reason: keyError };
    if (!isIn(raw.home, EXISTING_HOME_KINDS)) return { reason: `${label}.home must be \`fold\` or \`atomic-edit\`.` };
    const target = parseExistingTarget(raw.target, `${label}.target`);
    if ("reason" in target) return target;
    if (target.value.kind === "document" && raw.home !== "atomic-edit") {
      return { reason: `${label}: document targets require \`home: "atomic-edit"\`.` };
    }
    if (target.value.kind !== "document" && raw.home !== "fold") {
      return { reason: `${label}: work-unit and draft-block targets require \`home: "fold"\`.` };
    }
    return { value: { kind: "existing-home", destinationId: raw.destinationId, target: target.value, home: raw.home } };
  }
  if (raw.kind === "cohort-coordination") {
    const keyError = exactKeys(raw, ["kind", "destinationId", "cohort"], label);
    if (keyError !== null) return { reason: keyError };
    if (!isNonEmptyString(raw.cohort) || !isSafeCohortPath(raw.cohort) || validateCohortPath(raw.cohort) !== null) {
      return { reason: `${label}.cohort must be a safe cohort path.` };
    }
    return { value: { kind: "cohort-coordination", destinationId: raw.destinationId, cohort: raw.cohort } };
  }
  return { reason: `${label} has an unknown \`kind\`.` };
}

function parseDrop(raw: Record<string, unknown>, label: string): Parsed<{ kind: "drop"; reason: string }> {
  const keyError = exactKeys(raw, ["kind", "reason"], label);
  if (keyError !== null) return { reason: keyError };
  if (!isNonEmptyString(raw.reason)) return { reason: `${label}.reason must be non-empty.` };
  return { value: { kind: "drop", reason: raw.reason } };
}

function parseTargetSet(raw: unknown, field: string, label: string): Parsed<string[]> {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(safeSlug)) {
    return { reason: `${label}.${field} must be a non-empty array of slug-safe values; use a reasoned drop for none.` };
  }
  const repeated = duplicate(raw);
  if (repeated !== null) return { reason: `${label}.${field} contains duplicate target \`${repeated}\`.` };
  return { value: sortedStrings(raw) };
}

function parseSourceAllocations(raw: unknown): Parsed<DecomposeAllocationMap["sourceAllocations"]> {
  if (!Array.isArray(raw)) return { reason: "cut-map requires a `sourceAllocations` array." };
  const values: DecomposeAllocationMap["sourceAllocations"] = [];
  for (let index = 0; index < raw.length; index++) {
    const item: unknown = raw[index];
    const label = `source allocation ${index}`;
    if (!isObject(item)) return { reason: `${label} must be an object.` };
    const keyError = exactKeys(item, ["sourceId", "ownership", "disposition"], label);
    if (keyError !== null) return { reason: keyError };
    if (!isCanonicalDigest(item.sourceId)) return { reason: `${label}.sourceId must be a canonical digest.` };
    if (item.ownership !== "destination-owned" && item.ownership !== "cohort-shared") {
      return { reason: `${label}.ownership must be \`destination-owned\` or \`cohort-shared\`.` };
    }
    if (!isObject(item.disposition)) return { reason: `${label}.disposition must be an object.` };
    if (item.disposition.kind === "drop") {
      const drop = parseDrop(item.disposition, `${label}.disposition`);
      if ("reason" in drop) return drop;
      values.push({ sourceId: item.sourceId, ownership: item.ownership, disposition: drop.value });
      continue;
    }
    if (item.disposition.kind !== "target") return { reason: `${label}.disposition.kind is invalid.` };
    const dispositionError = exactKeys(item.disposition, ["kind", "destinationId", "targetLocator"], `${label}.disposition`);
    if (dispositionError !== null) return { reason: dispositionError };
    if (!isNonEmptyString(item.disposition.destinationId)) {
      return { reason: `${label}.disposition.destinationId must be non-empty.` };
    }
    const locator = parseLocator(item.disposition.targetLocator, `${label}.disposition.targetLocator`);
    if ("reason" in locator) return locator;
    values.push({
      sourceId: item.sourceId,
      ownership: item.ownership,
      disposition: { kind: "target", destinationId: item.disposition.destinationId, targetLocator: locator.value },
    });
  }
  const repeated = duplicate(values.map((item) => item.sourceId));
  if (repeated !== null) return { reason: `duplicate source allocation for \`${repeated}\`.` };
  return { value: [...values].sort((left, right) => compareCanonicalStrings(left.sourceId, right.sourceId)) };
}

function parseIncomingEdges(raw: unknown): Parsed<DecomposeAllocationMap["incomingEdges"]> {
  if (!Array.isArray(raw)) return { reason: "cut-map requires an `incomingEdges` array." };
  const values: DecomposeAllocationMap["incomingEdges"] = [];
  for (let index = 0; index < raw.length; index++) {
    const item: unknown = raw[index];
    const label = `incoming edge ${index}`;
    if (!isObject(item)) return { reason: `${label} must be an object.` };
    const keyError = exactKeys(item, ["dependent", "disposition"], label);
    if (keyError !== null) return { reason: keyError };
    if (!safeSlug(item.dependent)) return { reason: `${label}.dependent must be slug-safe.` };
    if (!isObject(item.disposition)) return { reason: `${label}.disposition must be an object.` };
    if (item.disposition.kind === "drop") {
      const drop = parseDrop(item.disposition, `${label}.disposition`);
      if ("reason" in drop) return drop;
      values.push({ dependent: item.dependent, disposition: drop.value });
      continue;
    }
    if (item.disposition.kind !== "replace") return { reason: `${label}.disposition.kind is invalid.` };
    const dispositionError = exactKeys(item.disposition, ["kind", "replacementTargets"], `${label}.disposition`);
    if (dispositionError !== null) return { reason: dispositionError };
    const targets = parseTargetSet(item.disposition.replacementTargets, "replacementTargets", `${label}.disposition`);
    if ("reason" in targets) return targets;
    values.push({ dependent: item.dependent, disposition: { kind: "replace", replacementTargets: targets.value } });
  }
  const repeated = duplicate(values.map((item) => item.dependent));
  if (repeated !== null) return { reason: `duplicate incoming edge for dependent \`${repeated}\`.` };
  return { value: [...values].sort((left, right) => compareCanonicalStrings(left.dependent, right.dependent)) };
}

function parseOutgoingEdges(raw: unknown): Parsed<DecomposeAllocationMap["outgoingEdges"]> {
  if (!Array.isArray(raw)) return { reason: "cut-map requires an `outgoingEdges` array." };
  const values: DecomposeAllocationMap["outgoingEdges"] = [];
  for (let index = 0; index < raw.length; index++) {
    const item: unknown = raw[index];
    const label = `outgoing edge ${index}`;
    if (!isObject(item)) return { reason: `${label} must be an object.` };
    const keyError = exactKeys(item, ["prerequisite", "disposition"], label);
    if (keyError !== null) return { reason: keyError };
    if (!safeSlug(item.prerequisite)) return { reason: `${label}.prerequisite must be slug-safe.` };
    if (!isObject(item.disposition)) return { reason: `${label}.disposition must be an object.` };
    if (item.disposition.kind === "drop") {
      const drop = parseDrop(item.disposition, `${label}.disposition`);
      if ("reason" in drop) return drop;
      values.push({ prerequisite: item.prerequisite, disposition: drop.value });
      continue;
    }
    if (item.disposition.kind !== "targets") return { reason: `${label}.disposition.kind is invalid.` };
    const dispositionError = exactKeys(item.disposition, ["kind", "targets"], `${label}.disposition`);
    if (dispositionError !== null) return { reason: dispositionError };
    const targets = parseTargetSet(item.disposition.targets, "targets", `${label}.disposition`);
    if ("reason" in targets) return targets;
    values.push({ prerequisite: item.prerequisite, disposition: { kind: "targets", targets: targets.value } });
  }
  const repeated = duplicate(values.map((item) => item.prerequisite));
  if (repeated !== null) return { reason: `duplicate outgoing edge for prerequisite \`${repeated}\`.` };
  return { value: [...values].sort((left, right) => compareCanonicalStrings(left.prerequisite, right.prerequisite)) };
}

function entryIdentity(entry: DecomposeAllocationEntry): string {
  switch (entry.kind) {
    case "new-member":
    case "surviving-origin":
      return `work-unit:${entry.slug}`;
    case "existing-home": {
      const target = entry.target;
      if (target.kind === "work-unit") return `work-unit:${target.slug}`;
      if (target.kind === "draft-block") return `draft-block:${target.slug}:${JSON.stringify(target.locator)}`;
      return `document:${target.path}`;
    }
    case "cohort-coordination":
      return `cohort:${entry.cohort}`;
  }
}

function locatorsEqual(left: DecomposeContentLocator, right: DecomposeContentLocator): boolean {
  if (left.artifact !== right.artifact || left.kind !== right.kind) return false;
  return left.kind !== "section" || right.kind !== "section"
    || (left.headingSource === right.headingSource && left.occurrence === right.occurrence);
}

function targetLocatorMatches(entry: DecomposeAllocationEntry, locator: DecomposeContentLocator): boolean {
  if (entry.kind === "new-member" || entry.kind === "surviving-origin") {
    return new RegExp(`^[a-z]+-${entry.slug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.md$`, "u")
      .test(locator.artifact);
  }
  if (entry.kind === "existing-home") {
    if (entry.target.kind === "document") return entry.target.path.split("/").at(-1) === locator.artifact;
    if (entry.target.kind === "draft-block") return locatorsEqual(entry.target.locator, locator);
    return new RegExp(`^[a-z]+-${entry.target.slug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.md$`, "u")
      .test(locator.artifact);
  }
  return locator.artifact === `cohort-${entry.cohort.split("/").at(-1)}.md`;
}

/** Validate an untrusted decoded allocation map. */
export function parseCutMap(input: unknown): CutMapParseResult {
  if (!isObject(input)) return { status: "rejected", reason: "cut-map must be an object." };
  if (input.schemaVersion === 1) {
    return {
      status: "rejected",
      reason: "upgrade cut-map to version 2: replace receives/dependsOn with sourceAllocations, incomingEdges, and outgoingEdges.",
    };
  }
  if (input.schemaVersion !== DECOMPOSE_SCHEMA_VERSION) {
    return { status: "rejected", reason: "unrecognized cut-map `schemaVersion` (expected 2)." };
  }
  const topError = exactKeys(
    input,
    ["schemaVersion", "origin", "shape", "parentPosition", "cohort", "entries", "internalEdges", "sourceAllocations", "incomingEdges", "outgoingEdges"],
    "cut-map",
  );
  if (topError !== null) return { status: "rejected", reason: topError };

  if (!isObject(input.origin)) return { status: "rejected", reason: "cut-map requires an `origin` object." };
  const originError = exactKeys(input.origin, ["slug", "phase", "location"], "origin");
  if (originError !== null) return { status: "rejected", reason: originError };
  if (!safeSlug(input.origin.slug)) return { status: "rejected", reason: "origin.slug must be slug-safe." };
  if (!isIn(input.origin.phase, ORIGIN_PHASES)) return { status: "rejected", reason: "origin.phase must be Planning or Active." };
  if (!isIn(input.origin.location, ORIGIN_LOCATIONS)) return { status: "rejected", reason: "origin.location is invalid." };
  if (!isIn(input.shape, TRANSFORM_SHAPES)) return { status: "rejected", reason: "cut-map shape is invalid." };
  if (!isIn(input.parentPosition, PARENT_POSITIONS)) return { status: "rejected", reason: "cut-map parentPosition is invalid." };

  let cohort: string | undefined;
  if (input.cohort !== undefined) {
    if (!isNonEmptyString(input.cohort) || !isSafeCohortPath(input.cohort) || validateCohortPath(input.cohort) !== null) {
      return { status: "rejected", reason: "cohort must be a safe cohort path." };
    }
    cohort = input.cohort;
  }
  if (input.parentPosition === "at-cap" && cohort !== undefined) {
    return { status: "rejected", reason: "at-cap decomposition must omit `cohort`." };
  }
  if (input.parentPosition !== "at-cap" && cohort === undefined) {
    return { status: "rejected", reason: `${input.parentPosition} decomposition requires a cohort placement.` };
  }
  if (!Array.isArray(input.entries)) return { status: "rejected", reason: "cut-map requires an entries array." };
  const entries: DecomposeAllocationEntry[] = [];
  for (let index = 0; index < input.entries.length; index++) {
    const entry = parseEntry(input.entries[index], index);
    if ("reason" in entry) return { status: "rejected", reason: entry.reason };
    entries.push(entry.value);
  }
  const duplicateId = duplicate(entries.map((entry) => entry.destinationId));
  if (duplicateId !== null) return { status: "rejected", reason: `duplicate destinationId \`${duplicateId}\`.` };
  const coordinations = entries.filter((entry): entry is CohortCoordinationEntry => entry.kind === "cohort-coordination");
  if (coordinations.length > 1) return { status: "rejected", reason: "at most one cohort-coordination entry is allowed." };
  const duplicateIdentity = duplicate(entries.map(entryIdentity));
  if (duplicateIdentity !== null) return { status: "rejected", reason: `duplicate destination identity \`${duplicateIdentity}\`.` };
  if (coordinations[0] !== undefined && (cohort === undefined || coordinations[0].cohort !== cohort)) {
    return { status: "rejected", reason: "cohort-coordination must name the declared cohort." };
  }
  const members = entries.filter((entry): entry is NewMemberEntry => entry.kind === "new-member");
  const survivors = entries.filter((entry): entry is SurvivingOriginEntry => entry.kind === "surviving-origin");
  if (input.shape !== "extraction" && survivors.length > 0) {
    return { status: "rejected", reason: "surviving-origin entries are valid only for extraction." };
  }
  if ((input.shape === "symmetric" || input.shape === "backlog-stub-source") && members.length < 2) {
    return { status: "rejected", reason: `${input.shape} requires at least two new members.` };
  }
  if (input.shape === "extraction") {
    if (survivors.length !== 1 || survivors[0]?.slug !== input.origin.slug || members.length < 1) {
      return {
        status: "rejected",
        reason: "extraction requires exactly one surviving-origin entry naming the origin and at least one new member.",
      };
    }
  }
  if (input.shape === "heterogeneous-home" && entries.length < 2) {
    return { status: "rejected", reason: "heterogeneous-home requires at least two destinations." };
  }

  if (!Array.isArray(input.internalEdges)) return { status: "rejected", reason: "cut-map requires an internalEdges array." };
  const memberSlugs = new Set(members.map((member) => member.slug));
  const internalEdges: InternalEdge[] = [];
  for (let index = 0; index < input.internalEdges.length; index++) {
    const edge: unknown = input.internalEdges[index];
    if (!isObject(edge)) return { status: "rejected", reason: `internal edge ${index} must be an object.` };
    const keyError = exactKeys(edge, ["from", "to"], `internal edge ${index}`);
    if (keyError !== null) return { status: "rejected", reason: keyError };
    if (!safeSlug(edge.from) || !memberSlugs.has(edge.from)) return { status: "rejected", reason: `internal edge ${index} references unknown from member.` };
    if (!safeSlug(edge.to) || !memberSlugs.has(edge.to)) return { status: "rejected", reason: `internal edge ${index} references unknown to member.` };
    if (edge.from === edge.to) return { status: "rejected", reason: `internal edge ${index} cannot be a self-dependency.` };
    internalEdges.push({ from: edge.from, to: edge.to });
  }
  const repeatedInternal = duplicate(internalEdges.map((edge) => `${edge.from}\0${edge.to}`));
  if (repeatedInternal !== null) return { status: "rejected", reason: "duplicate internal edge." };

  const sourceAllocations = parseSourceAllocations(input.sourceAllocations);
  if ("reason" in sourceAllocations) return { status: "rejected", reason: sourceAllocations.reason };
  const destinations = new Map(entries.map((entry) => [entry.destinationId, entry]));
  for (const allocation of sourceAllocations.value) {
    if (allocation.disposition.kind !== "target") continue;
    const destination = destinations.get(allocation.disposition.destinationId);
    if (destination === undefined) {
      return { status: "rejected", reason: `source allocation references unknown destinationId \`${allocation.disposition.destinationId}\`.` };
    }
    if (!targetLocatorMatches(destination, allocation.disposition.targetLocator)) {
      return {
        status: "rejected",
        reason: `source allocation target locator does not belong to destination \`${allocation.disposition.destinationId}\`.`,
      };
    }
  }
  const incomingEdges = parseIncomingEdges(input.incomingEdges);
  if ("reason" in incomingEdges) return { status: "rejected", reason: incomingEdges.reason };
  const outgoingEdges = parseOutgoingEdges(input.outgoingEdges);
  if ("reason" in outgoingEdges) return { status: "rejected", reason: outgoingEdges.reason };

  const dependencyRecipients = new Set<string>(members.map((member) => member.slug));
  for (const entry of entries) {
    if (entry.kind === "existing-home" && entry.target.kind === "work-unit") dependencyRecipients.add(entry.target.slug);
  }
  for (const edge of incomingEdges.value) {
    if (edge.disposition.kind !== "replace") continue;
    const unknown = edge.disposition.replacementTargets.find((target) => !dependencyRecipients.has(target));
    if (unknown !== undefined) return { status: "rejected", reason: `replacement target \`${unknown}\` cannot receive WU dependencies.` };
    if (edge.disposition.replacementTargets.includes(edge.dependent)) {
      return { status: "rejected", reason: `incoming edge for \`${edge.dependent}\` cannot create a self-dependency.` };
    }
  }
  for (const edge of outgoingEdges.value) {
    if (edge.disposition.kind !== "targets") continue;
    const unknown = edge.disposition.targets.find((target) => !dependencyRecipients.has(target));
    if (unknown !== undefined) return { status: "rejected", reason: `outgoing consumer \`${unknown}\` cannot receive WU dependencies.` };
    if (edge.disposition.targets.includes(edge.prerequisite)) {
      return { status: "rejected", reason: `outgoing edge for \`${edge.prerequisite}\` cannot create a self-dependency.` };
    }
  }

  const map: DecomposeAllocationMap = {
    schemaVersion: DECOMPOSE_SCHEMA_VERSION,
    origin: { slug: input.origin.slug, phase: input.origin.phase, location: input.origin.location },
    shape: input.shape,
    parentPosition: input.parentPosition,
    entries: [...entries].sort((left, right) => compareCanonicalStrings(left.destinationId, right.destinationId)),
    internalEdges: [...internalEdges].sort(
      (left, right) => compareCanonicalStrings(left.from, right.from) || compareCanonicalStrings(left.to, right.to),
    ),
    sourceAllocations: sourceAllocations.value,
    incomingEdges: incomingEdges.value,
    outgoingEdges: outgoingEdges.value,
  };
  if (cohort !== undefined) map.cohort = cohort;
  return { status: "parsed", params: map };
}

/** Check retirement-only allocation and approved ownership constraints. */
export function retirementAllocationRefusal(map: DecomposeAllocationMap): string | null {
  if (map.shape === "extraction" || map.entries.some((entry) => entry.kind === "surviving-origin")) {
    return "a surviving origin cannot authorize retirement.";
  }
  const destinations = new Map(map.entries.map((entry) => [entry.destinationId, entry]));
  for (const allocation of map.sourceAllocations) {
    const destination = allocation.disposition.kind === "target"
      ? destinations.get(allocation.disposition.destinationId)
      : undefined;
    if (allocation.ownership === "cohort-shared" && destination?.kind !== "cohort-coordination") {
      return `ownerless shared material \`${allocation.sourceId}\` requires a cohort-coordination destination.`;
    }
    if (allocation.ownership === "destination-owned" && destination?.kind === "cohort-coordination") {
      return `cohort-coordination destination requires \`cohort-shared\` ownership for \`${allocation.sourceId}\`.`;
    }
  }
  return null;
}
