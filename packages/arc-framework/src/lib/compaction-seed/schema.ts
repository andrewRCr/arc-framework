/**
 * Compaction seed schema and JSON boundary helpers.
 *
 * The seed is a lean, invocation-neutral recovery manifest: live session
 * pointers, the embedded load-set baseline, the task-list cursor projection,
 * and a deterministic list of dirty files. It carries ARC-owned recovery state,
 * not harness instruction files, command spelling, or reasoning prose.
 *
 * @module
 */

import { posix } from "node:path";

import {
  LOAD_SET_MANIFEST_VERSION,
  type LoadSetEntry,
  type LoadSetManifest,
  type ReadMode,
} from "../load-set/types.js";
import type { TaskListCursor } from "../task-list/cursor.js";

/** Current compaction seed envelope version. */
export const COMPACTION_SEED_SCHEMA_VERSION = 1;

/** Version literal for schema-v1 compaction seed envelopes. */
export type CompactionSeedSchemaVersion = typeof COMPACTION_SEED_SCHEMA_VERSION;

/** Session lifecycle type captured by the seed when a WU is active. */
export type CompactionSeedSessionType = "planning" | "execution" | "integration";

/** Schema-v1 compaction seed. */
export interface CompactionSeed {
  /** Seed envelope version. */
  schemaVersion: CompactionSeedSchemaVersion;
  /** ISO-8601 emission timestamp, used for audit/debug only. */
  emittedAt: string;

  /** Absolute checkout root containing `.arc/`. */
  repoRoot: string;
  /** Current branch at seed emission. */
  branch: string;
  /** HEAD SHA at seed emission. */
  head: string;
  /** Whether the working tree was dirty at seed emission. */
  dirty: boolean;
  /** Active WU slug, or `null` between work units. */
  activeWorkUnit: string | null;
  /** Active meta path relative to `repoRoot`, or `null` when none resolved. */
  metaPath: string | null;
  /** Resolved session type, or `null` when no lifecycle applies. */
  sessionType: CompactionSeedSessionType | null;
  /** Current lifecycle/planning workflow label for soft orientation, or `null` when none applies. */
  currentWorkflow: string | null;
  /** Task-list-derived cursor, or `null` when planning, unresolved, or no task is open. */
  taskCursor: TaskListCursor | null;

  /** Embedded load-set baseline, produced by the shared load-set projection. */
  loadSet: LoadSetManifest;
  /** Git-derived dirty-file list in deterministic order. */
  uncommittedFiles: string[];
}

/** Parse/validation failure for a compaction seed JSON boundary. */
export interface CompactionSeedSchemaError {
  /** Error category for callers that need to branch without parsing prose. */
  kind: "malformed-json" | "schema-version-mismatch" | "invalid-schema";
  /** Human-readable failure detail. */
  message: string;
  /** Schema version found on a mismatch, if the payload exposed one. */
  actualVersion?: unknown;
  /** Underlying JSON parse error. */
  cause?: Error;
}

/** Result of parsing untrusted JSON into a compaction seed. */
export type CompactionSeedParseResult =
  | { ok: true; seed: CompactionSeed }
  | { ok: false; error: CompactionSeedSchemaError };

const SESSION_TYPES: readonly CompactionSeedSessionType[] = [
  "planning",
  "execution",
  "integration",
];

/**
 * Parse and validate a JSON-encoded compaction seed.
 *
 * @param content - Raw JSON file content
 * @returns The typed seed or a categorized schema error
 */
export function parseCompactionSeedJson(content: string): CompactionSeedParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "malformed-json",
        message: "compaction seed contains malformed JSON",
        cause: err instanceof Error ? err : new Error(String(err)),
      },
    };
  }

  if (!isRecord(parsed) || getSchemaVersion(parsed) === undefined) {
    return {
      ok: false,
      error: {
        kind: "invalid-schema",
        message: "compaction seed does not match schema v1",
      },
    };
  }

  if (parsed.schemaVersion !== COMPACTION_SEED_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        kind: "schema-version-mismatch",
        message: `compaction seed schemaVersion must be ${COMPACTION_SEED_SCHEMA_VERSION}, `
          + `got ${String(getSchemaVersion(parsed))}`,
        actualVersion: getSchemaVersion(parsed),
      },
    };
  }

  if (!isCompactionSeed(parsed)) {
    return {
      ok: false,
      error: {
        kind: "invalid-schema",
        message: "compaction seed does not match schema v1",
      },
    };
  }

  return { ok: true, seed: toCanonicalCompactionSeed(parsed) };
}

/**
 * Serialize a validated compaction seed as stable JSON text.
 *
 * @param seed - Seed object to serialize
 * @returns Pretty JSON with a trailing newline for file writes
 */
export function stringifyCompactionSeed(seed: CompactionSeed): string {
  assertCompactionSeed(seed);
  return `${JSON.stringify(toCanonicalCompactionSeed(seed), null, 2)}\n`;
}

function toCanonicalCompactionSeed(seed: CompactionSeed): CompactionSeed {
  return {
    schemaVersion: seed.schemaVersion,
    emittedAt: seed.emittedAt,
    repoRoot: seed.repoRoot,
    branch: seed.branch,
    head: seed.head,
    dirty: seed.dirty,
    activeWorkUnit: seed.activeWorkUnit,
    metaPath: seed.metaPath,
    sessionType: seed.sessionType,
    currentWorkflow: seed.currentWorkflow,
    taskCursor: toCanonicalTaskCursor(seed.taskCursor),
    loadSet: toCanonicalLoadSetManifest(seed.loadSet),
    uncommittedFiles: [...seed.uncommittedFiles],
  };
}

function toCanonicalTaskCursor(cursor: TaskListCursor | null): TaskListCursor | null {
  if (cursor === null) return null;
  return {
    section: toCanonicalTaskCursorItem(cursor.section),
    leaf: toCanonicalTaskCursorItem(cursor.leaf),
  };
}

function toCanonicalTaskCursorItem(item: TaskListCursor["section"]): TaskListCursor["section"] {
  return {
    id: item.id,
    title: item.title,
    lineHint: item.lineHint,
  };
}

function toCanonicalLoadSetManifest(manifest: LoadSetManifest): LoadSetManifest {
  return {
    manifestVersion: manifest.manifestVersion,
    entries: manifest.entries.map(toCanonicalLoadSetEntry),
  };
}

function toCanonicalLoadSetEntry(entry: LoadSetEntry): LoadSetEntry {
  return {
    path: entry.path,
    readMode: toCanonicalReadMode(entry.readMode),
  };
}

function toCanonicalReadMode(readMode: ReadMode): ReadMode {
  switch (readMode.kind) {
    case "full":
    case "partial-strategic":
      return { kind: readMode.kind };
    case "partial-section":
      return {
        kind: "partial-section",
        heading: readMode.heading,
      };
  }
}

/**
 * Runtime guard for a schema-v1 compaction seed.
 *
 * @param value - Unverified value from caller or parsed JSON
 * @returns Whether the value is a valid schema-v1 seed
 */
export function isCompactionSeed(value: unknown): value is CompactionSeed {
  if (!isRecord(value)) return false;

  return value.schemaVersion === COMPACTION_SEED_SCHEMA_VERSION
    && typeof value.emittedAt === "string"
    && isAbsoluteRepoRoot(value.repoRoot)
    && typeof value.branch === "string"
    && typeof value.head === "string"
    && typeof value.dirty === "boolean"
    && isNullableString(value.activeWorkUnit)
    && isNullableRepoRelativePath(value.metaPath)
    && isNullableSessionType(value.sessionType)
    && isNullableString(value.currentWorkflow)
    && isNullableTaskCursor(value.taskCursor)
    && isLoadSetManifest(value.loadSet)
    && isRepoRelativePathArray(value.uncommittedFiles);
}

/**
 * Assert that a value matches the schema-v1 compaction seed shape.
 *
 * @param value - Unverified value to validate
 * @throws When the value does not match schema v1
 */
export function assertCompactionSeed(value: unknown): asserts value is CompactionSeed {
  if (!isRecord(value) || value.schemaVersion !== COMPACTION_SEED_SCHEMA_VERSION) {
    throw new Error(
      `compaction-seed: schemaVersion must be ${COMPACTION_SEED_SCHEMA_VERSION}, `
      + `got ${String(getSchemaVersion(value))}`,
    );
  }
  if (!isCompactionSeed(value)) {
    throw new Error("compaction-seed: value does not match schema v1");
  }
}

function getSchemaVersion(value: unknown): unknown {
  return isRecord(value) ? value.schemaVersion : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isAbsoluteRepoRoot(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && (
      value.startsWith("/")
      || /^[A-Za-z]:[\\/]/u.test(value)
      || value.startsWith("\\\\")
    );
}

function isRepoRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (
    value.includes("\\")
    || value.startsWith("/")
    || value.startsWith("//")
    || /^[A-Za-z]:/u.test(value)
    || posix.normalize(value) !== value
  ) {
    return false;
  }
  return !value.split("/").some((segment) =>
    segment.length === 0 || segment === "." || segment === "..");
}

function isNullableRepoRelativePath(value: unknown): value is string | null {
  return value === null || isRepoRelativePath(value);
}

function isRepoRelativePathArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isRepoRelativePath);
}

function isNullableSessionType(
  value: unknown,
): value is CompactionSeedSessionType | null {
  return value === null
    || (typeof value === "string" && (SESSION_TYPES as readonly string[]).includes(value));
}

function isNullableTaskCursor(value: unknown): value is TaskListCursor | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return isTaskCursorItem(value.section) && isTaskCursorItem(value.leaf);
}

function isTaskCursorItem(value: unknown): value is TaskListCursor["section"] {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.lineHint === "number"
    && Number.isInteger(value.lineHint)
    && value.lineHint > 0;
}

function isLoadSetManifest(value: unknown): value is LoadSetManifest {
  if (!isRecord(value)) return false;
  return value.manifestVersion === LOAD_SET_MANIFEST_VERSION
    && Array.isArray(value.entries)
    && value.entries.every(isLoadSetEntry);
}

function isLoadSetEntry(value: unknown): value is LoadSetEntry {
  if (!isRecord(value)) return false;
  return isRepoRelativePath(value.path) && isReadMode(value.readMode);
}

function isReadMode(value: unknown): value is ReadMode {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "full":
    case "partial-strategic":
      return true;
    case "partial-section":
      return typeof value.heading === "string";
    default:
      return false;
  }
}
