/** Pure subject joins and checkout-directed workflow projection for the locus roster. */

import { relative, sep } from "node:path";

import {
  inferSessionType,
  resolvePlanningStage,
  resolveTaskListPath,
} from "../../commands/active/status.js";
import type { SessionType } from "../../commands/active/types.js";
import type { TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import { resolveLoadSetManifest } from "../load-set/projection.js";
import type { LoadSetManifest } from "../load-set/types.js";
import { resolveActiveCohortDocPath } from "../session-init/cohort-doc.js";
import {
  resolveTaskListCursorFromFile,
  type TaskListCursorFileResult,
} from "../task-list/file-cursor.js";
import type { MetaEvidence } from "./evidence.js";
import type { LocusIdentityV1, LocusRecordV1 } from "./schema/index.js";

export interface SubjectMetaIO {
  readFile(path: string): Promise<string>;
  pathExists(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
}

export type SubjectMetaProjection =
  | { kind: "unresolved"; code: "subject-unresolved"; message: string; metaPath: string | null }
  | {
      kind: "resolved";
      metaPath: string;
      owner: string | null;
      branch: string | null;
      sessionType: SessionType | null;
      workflow: string | null;
      stage: string | null;
      taskListPath: string | null;
      taskCursor: TaskListCursorFileResult | null;
      cohortDocPath: string | null;
      loadSet: LoadSetManifest;
    };

export type ManagedSubjectProjection =
  | {
      kind: "resolved";
      authority: "work-unit" | "transient" | "partial-transient";
      identity: LocusIdentityV1 | null;
      meta: Extract<SubjectMetaProjection, { kind: "resolved" }> | null;
    }
  | {
      kind: "unresolved";
      reasons: readonly ("subject-unresolved" | "cross-identity" | "marker-missing")[];
    };

/** Join a valid record to exact checkout, marker, identity, owner, branch, and meta authority. */
export function projectManagedSubject(options: {
  identity: string;
  checkout: RegisteredWorktree;
  record: LocusRecordV1;
  marker: WorktreeMarkerReadResult | { kind: "error"; message: string };
  identities: TransientIdentitySnapshot;
  meta: SubjectMetaProjection | null;
}): ManagedSubjectProjection {
  const reasons = new Set<"subject-unresolved" | "cross-identity" | "marker-missing">();
  if (options.record.checkoutPath !== options.checkout.path) reasons.add("subject-unresolved");
  const role = options.record.role;
  const pair = `${role.kind}/${role.subject.kind}`;

  if (pair === "work-unit/work-unit") {
    const meta = options.meta;
    if (meta?.kind !== "resolved") reasons.add("subject-unresolved");
    if (meta?.kind === "resolved" && meta.owner !== options.identity) reasons.add("cross-identity");
    if (meta?.kind === "resolved" && meta.branch !== options.checkout.branch) reasons.add("subject-unresolved");
    if (markerMustAgree(options.checkout, options.marker)
      && !markerMatches(options.marker, options.identity, { kind: "work-unit", key: role.subject.key })) {
      addMarkerReason(reasons, options.marker, options.identity);
    }
    return reasons.size === 0 && meta?.kind === "resolved"
      ? { kind: "resolved", authority: "work-unit", identity: null, meta }
      : { kind: "unresolved", reasons: [...reasons] };
  }

  if (pair === "errand/partial-errand" || pair === "housekeep/housekeep") {
    if (role.subject.claimId !== null) reasons.add("subject-unresolved");
    if (!options.checkout.primary
      && !markerMatches(options.marker, options.identity, { kind: "branch", key: options.checkout.branch ?? "" })) {
      addMarkerReason(reasons, options.marker, options.identity);
    }
    return reasons.size === 0
      ? { kind: "resolved", authority: "partial-transient", identity: null, meta: null }
      : { kind: "unresolved", reasons: [...reasons] };
  }

  const identity = exactIdentity(options.identities, role.subject.kind, role.subject.key, role.subject.claimId);
  if (identity === null) reasons.add("subject-unresolved");
  if (identity !== null && !identityMatchesRole(identity, role.kind)) reasons.add("subject-unresolved");
  if (identity !== null && identityBranch(identity) !== options.checkout.branch) reasons.add("subject-unresolved");
  if (markerMustAgree(options.checkout, options.marker)
    && !markerMatches(options.marker, options.identity, transientMarker(identity, role.subject.key))) {
    addMarkerReason(reasons, options.marker, options.identity);
  }
  return reasons.size === 0 && identity !== null
    ? { kind: "resolved", authority: "transient", identity, meta: null }
    : { kind: "unresolved", reasons: [...reasons] };
}

/** Select one exact subject meta and derive its workflow state with reads pinned to its checkout. */
export async function projectCheckoutSubjectMeta(options: {
  cwd: string;
  subjectKey: string;
  identity: string;
  identityGlobalUserDir?: string | null;
  metaRoot: { kind: "maintainer" } | { kind: "contributor"; identity: string };
  candidates: readonly MetaEvidence[];
  activeExtensions: readonly string[];
  io: SubjectMetaIO;
}): Promise<SubjectMetaProjection> {
  const expectedPath = options.metaRoot.kind === "maintainer"
    ? `.arc/active/meta-${options.subjectKey}.md`
    : `.arc/user/${options.metaRoot.identity}/active/meta-${options.subjectKey}.md`;
  const matches = options.candidates.filter((candidate) =>
    normalizedRelative(options.cwd, candidate.path) === expectedPath);
  if (matches.length !== 1) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: `Expected one exact subject meta at ${expectedPath}; found ${matches.length}`,
      metaPath: matches.length === 0 ? null : expectedPath,
    };
  }
  const selected = matches[0];
  if (selected === undefined || selected.kind === "error") {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: selected?.message ?? `Subject meta is unavailable: ${expectedPath}`,
      metaPath: expectedPath,
    };
  }

  let record;
  try {
    record = parseMetaRecord(selected.text);
  } catch (error) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: error instanceof Error ? error.message : String(error),
      metaPath: expectedPath,
    };
  }
  const sessionType = inferSessionType(record.State, record["Task List"], record["Next Action"], record.Branch);
  const planningStage = resolvePlanningStage(record["Current Workflow"], sessionType);
  const taskListPath = resolveTaskListPath(expectedPath, record["Task List"]);
  const taskCursor = taskListPath === null
    ? null
    : await resolveTaskListCursorFromFile({
        cwd: options.cwd,
        taskListPath,
        readFile: (path) => options.io.readFile(path),
        realpath: (path) => options.io.realpath(path),
        lstat: (path) => options.io.lstat(path),
      });
  const cohortDocPath = await resolveActiveCohortDocPath({
    cwd: options.cwd,
    activeMetaPath: expectedPath,
    fs: options.io,
  });
  return {
    kind: "resolved",
    metaPath: expectedPath,
    owner: normalizePointer(record.Owner),
    branch: normalizePointer(record.Branch),
    sessionType,
    workflow: workflowFor(sessionType),
    stage: planningStage,
    taskListPath,
    taskCursor,
    cohortDocPath,
    loadSet: resolveLoadSetManifest({
      identity: options.identity,
      identityGlobalUserDir: options.identityGlobalUserDir,
      activeWorkUnit: options.subjectKey,
      metaPath: expectedPath,
      sessionType,
      planningStage,
      taskListPath,
      activeExtensions: options.activeExtensions,
      cohortDocPath,
    }),
  };
}

function normalizedRelative(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/");
}

function normalizePointer(value: string | null): string | null {
  return value === null || value === "" || value === "[none]" ? null : value;
}

function workflowFor(sessionType: SessionType | null): string | null {
  if (sessionType === "planning") return "planning";
  if (sessionType === "execution") return "process-task-loop";
  if (sessionType === "integration") return "integrate-work-unit";
  return null;
}

function exactIdentity(
  snapshot: TransientIdentitySnapshot,
  kind: string,
  key: string,
  claimId: string | null,
): LocusIdentityV1 | null {
  if (snapshot.kind !== "complete" || claimId === null) return null;
  const identity = snapshot.projections.get(key);
  return identity !== undefined
    && identity.kind === kind
    && identity.key === key
    && identity.claimId === claimId
    ? identity
    : null;
}

function identityBranch(identity: LocusIdentityV1): string | null {
  return "branch" in identity ? identity.branch : null;
}

function identityMatchesRole(identity: LocusIdentityV1, roleKind: string): boolean {
  if (roleKind === "groom") return identity.kind === "groom";
  if (identity.kind !== "errand") return false;
  if (roleKind === "errand") return identity.purpose === "errand";
  return roleKind === "housekeep" && identity.purpose === "housekeep-routing";
}

function markerMustAgree(
  checkout: RegisteredWorktree,
  marker: WorktreeMarkerReadResult | { kind: "error"; message: string },
): boolean {
  return !checkout.primary || marker.kind !== "absent";
}

function transientMarker(
  identity: LocusIdentityV1 | null,
  key: string,
): { kind: "errand" | "branch"; key: string } {
  return identity?.kind === "errand"
    ? { kind: "errand", key }
    : { kind: "branch", key: identity === null ? "" : identityBranch(identity) ?? "" };
}

function markerMatches(
  result: WorktreeMarkerReadResult | { kind: "error"; message: string },
  identity: string,
  expected: { kind: "work-unit" | "errand" | "branch"; key: string },
): boolean {
  if (result.kind !== "present" || result.marker.spawningIdentity !== identity) return false;
  const subject = result.marker.createdFor
    ?? (result.marker.wuName === undefined ? undefined : { kind: "work-unit" as const, name: result.marker.wuName });
  if (subject === undefined || subject.kind !== expected.kind) return false;
  if (subject.kind === "work-unit") return subject.name === expected.key;
  if (subject.kind === "errand") return subject.slug === expected.key;
  return subject.ref === expected.key;
}

function addMarkerReason(
  reasons: Set<"subject-unresolved" | "cross-identity" | "marker-missing">,
  marker: WorktreeMarkerReadResult | { kind: "error"; message: string },
  identity: string,
): void {
  if (marker.kind === "absent") reasons.add("marker-missing");
  else if (marker.kind === "present" && marker.marker.spawningIdentity !== identity) reasons.add("cross-identity");
  else reasons.add("subject-unresolved");
}
