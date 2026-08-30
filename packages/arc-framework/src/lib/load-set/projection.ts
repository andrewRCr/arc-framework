/**
 * Pure load-set projection for session context recovery.
 *
 * The projection consumes already-resolved session pointers and emits the
 * ordered context set ARC would load for that state. It performs no filesystem
 * or git reads, keeping the status envelope and compaction seed schema on one
 * shared context-load contract.
 *
 * @module
 */

import { isAbsolute } from "node:path";

import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";

import {
  LOAD_SET_MANIFEST_VERSION,
  LoadSetPathSchema,
  type LoadSetEntry,
  type LoadSetManifest,
} from "./types.js";

/** Session type resolved by the active-work probe. */
export type LoadSetSessionType = "planning" | "execution" | "prepublication" | "integration";

/** Planning-stage workflow basename resolved from `Current Workflow`. */
export type LoadSetPlanningStage = "draft-design" | "create-spec" | "generate-tasks";

/** Deterministic work substage derived from canonical lifecycle facts. */
export type LoadSetWorkUnitStage = "task-work" | "verification-closeout";

/** Already-resolved pointers needed to project the session load set. */
export interface LoadSetProjectionInput {
  /** ARC identity, or `null` when identity is absent. */
  identity: string | null;
  /**
   * Exact identity-global working-memory path selected by the user-surface owner.
   * When omitted, defaults to the active-checkout-relative semantic projection.
   */
  workingMemoryPath?: string | null;
  /** Active WU slug, or `null` between units / unresolved. */
  activeWorkUnit: string | null;
  /** Active meta path relative to the repo root, or `null` when none resolved. */
  metaPath: string | null;
  /** Current session type, or `null` when unresolved / orphaned. */
  sessionType: LoadSetSessionType | null;
  /** Planning lifecycle stage; used only when `sessionType === "planning"`. */
  planningStage: LoadSetPlanningStage | null;
  /** Derived task or verification substage inside execution or integration. */
  workUnitStage?: LoadSetWorkUnitStage | null;
  /** Active task-list path relative to the repo root, or `null` when none applies. */
  taskListPath: string | null;
  /**
   * Active extension names from the session-init extensions slot.
   *
   * Names stay in the status envelope for workflow fire-points to consult.
   * Extension bodies are intentionally excluded from the session load set.
   */
  activeExtensions: readonly string[];
  /** Active cohort coordination doc path, or `null` when none resolved. */
  cohortDocPath: string | null;
}

function full(path: string): LoadSetEntry {
  assertLoadSetPath(path);
  return { path, readMode: { kind: "full" } };
}

function partialStrategic(path: string): LoadSetEntry {
  assertLoadSetPath(path);
  return { path, readMode: { kind: "partial-strategic" } };
}

function cloneEntry(entry: LoadSetEntry): LoadSetEntry {
  return {
    path: entry.path,
    readMode: { ...entry.readMode },
  };
}

const ARC_CONTEXT_ENTRIES: readonly LoadSetEntry[] = [
  full(".arc/reference/briefs/AGENT-BRIEF.ARC.md"),
  full(".arc/reference/briefs/AGENT-BRIEF.PROJECT.md"),
  full(".arc/system/rules/DEV-RULES.ARC.md"),
  full(".arc/system/rules/DEV-RULES.PROJECT.md"),
  full(".arc/reference/strategies/STRATEGY-INDEX.md"),
  {
    path: ".arc/reference/QUICK-REFERENCE.md",
    readMode: {
      kind: "partial-section",
      heading: "Environment & Path Context",
    },
  },
];

/**
 * Resolve the ordered session load set from already-known state.
 *
 * @param input - Resolved session pointers from status/seed state.
 * @returns Ordered load-set manifest; entry order is read order.
 */
export function resolveLoadSetManifest(input: LoadSetProjectionInput): LoadSetManifest {
  const entries: LoadSetEntry[] = ARC_CONTEXT_ENTRIES.map(cloneEntry);
  const workflowRoot = resolveArcPath({ kind: "procedure-root", family: "workflows" });
  const workUnitStage = input.workUnitStage ?? null;

  if (input.metaPath !== null) {
    entries.push(full(input.metaPath));
  }

  if (input.identity !== null && input.activeWorkUnit !== null) {
    entries.push(full(resolveArcPath({
      kind: "user-document",
      identity: layoutSlug(input.identity),
      document: { kind: "session-notes", workUnit: layoutSlug(input.activeWorkUnit) },
    })));
  }

  if (input.identity !== null) {
    entries.push(identityGlobalFull(input.workingMemoryPath ?? resolveArcPath({
      kind: "user-document",
      identity: layoutSlug(input.identity),
      document: { kind: "working-memory" },
    })));
  }

  if (input.sessionType === "planning" && input.planningStage !== null) {
    entries.push(full(`${workflowRoot}/arc/${input.planningStage}.md`));
  }

  if (input.sessionType === "execution" || input.sessionType === "integration") {
    if (workUnitStage === "verification-closeout") {
      entries.push(full(`${workflowRoot}/arc/work-unit-lifecycle/verify-work-unit.md`));
    } else if (workUnitStage === "task-work" || input.sessionType === "execution") {
      if (input.taskListPath !== null) {
        entries.push(partialStrategic(input.taskListPath));
      }
      entries.push(full(`${workflowRoot}/arc/process-task-loop.md`));
    }
  }

  if (input.sessionType === "prepublication") {
    entries.push(full(`${workflowRoot}/arc/work-unit-lifecycle/prepare-work-unit.md`));
  }

  if (input.sessionType === "integration" && workUnitStage === null) {
    entries.push(full(`${workflowRoot}/arc/work-unit-lifecycle/integrate-work-unit.md`));
  }

  if (input.cohortDocPath !== null) {
    entries.push(full(input.cohortDocPath));
  }

  return { manifestVersion: LOAD_SET_MANIFEST_VERSION, entries };
}

function identityGlobalFull(path: string): LoadSetEntry {
  assertIdentityGlobalLoadSetPath(path);
  return { path, readMode: { kind: "full" } };
}

function layoutSlug(segment: string) {
  safePathSegment(segment);
  return SlugSchema.parse(segment);
}

function safePathSegment(segment: string): string {
  if (
    segment.length === 0
    || segment === "."
    || segment === ".."
    || /[<>:"/\\|?*\0]/u.test(segment)
    || /[. ]$/u.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
  ) {
    throw new Error(`Load-set path segment must be safe: ${segment}`);
  }
  return segment;
}

/** Assert that a path is safe to include in a load-set manifest. */
export function assertLoadSetPath(path: string): void {
  const segments = path.split("/");
  if (
    path.length === 0
    || path === "."
    || path.includes("\\")
    || path.startsWith("/")
    || path.startsWith("//")
    || isAbsolute(path)
    || /^[A-Za-z]:/u.test(path)
    || path.includes("\0")
    || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Load-set path must be repository-relative: ${path}`);
  }
  for (const segment of segments) {
    safePathSegment(segment);
  }
}

/** Assert a resolver-produced identity-global path is safe to include in a load-set manifest. */
export function assertIdentityGlobalLoadSetPath(path: string): void {
  if (!LoadSetPathSchema.safeParse(path).success) {
    throw new Error(`Identity-global load-set path must be canonical: ${path}`);
  }
  if (!isAbsolute(path) && !/^[A-Za-z]:\\/u.test(path) && !path.startsWith("\\\\")) {
    assertLoadSetPath(path);
  }
}
