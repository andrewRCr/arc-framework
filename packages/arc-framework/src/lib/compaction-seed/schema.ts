/**
 * Compaction-seed runtime authority and JSON boundary helpers.
 *
 * The strict producer schema and recursively stripping persisted-reader schema
 * derive from one field graph. Version posture remains enforced explicitly at
 * the read boundary because registry metadata is declarative.
 *
 * @module
 */

import { posix } from "node:path";

import { z } from "zod";

import {
  LoadSetManifestReaderSchema,
  LoadSetManifestSchema,
} from "../load-set/types.js";
import {
  TaskListCursorReaderSchema,
  TaskListCursorSchema,
} from "../task-list/cursor.js";
import {
  LocusAbsolutePathSchema,
} from "../locus/schema/index.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";

/** Current compaction-seed envelope version. */
export const COMPACTION_SEED_SCHEMA_VERSION = 1;

const REPOSITORY_RELATIVE_PATH_SCHEMA = z.string().refine(isRepositoryRelativePath, {
  error: "Path must be canonical and repository-relative",
});
const ABSOLUTE_REPOSITORY_ROOT_SCHEMA = z.string().refine((value) =>
  value.length > 0
  && (
    value.startsWith("/")
    || /^[A-Za-z]:[\\/]/u.test(value)
    || value.startsWith("\\\\")
  ), { error: "Repository root must be absolute" });
const SESSION_TYPE_SCHEMA = z.enum(["planning", "execution", "prepublication", "integration"]);

/** Checkout-local recovery hint captured from the entering derived frame. */
export const CompactionSeedLocusHintSchema = z.strictObject({
  checkoutPath: LocusAbsolutePathSchema,
  parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
});

const COMPACTION_SEED_FIELDS = {
  schemaVersion: z.literal(COMPACTION_SEED_SCHEMA_VERSION),
  emittedAt: z.string(),
  repoRoot: ABSOLUTE_REPOSITORY_ROOT_SCHEMA,
  branch: z.string(),
  head: z.string(),
  dirty: z.boolean(),
  activeWorkUnit: z.string().nullable(),
  metaPath: REPOSITORY_RELATIVE_PATH_SCHEMA.nullable(),
  sessionType: SESSION_TYPE_SCHEMA.nullable(),
  currentWorkflow: z.string().nullable(),
  taskCursor: TaskListCursorSchema.nullable(),
  loadSet: LoadSetManifestSchema,
  uncommittedFiles: z.array(REPOSITORY_RELATIVE_PATH_SCHEMA),
  locus: CompactionSeedLocusHintSchema,
};

/** Strict producer authority for schema-v1 compaction seeds. */
export const CompactionSeedSchema = z.strictObject(COMPACTION_SEED_FIELDS);

/** Recursively unknown-stripping authority for persisted seed reads. */
export const CompactionSeedReaderSchema = z.object({
  ...COMPACTION_SEED_FIELDS,
  taskCursor: TaskListCursorReaderSchema.nullable(),
  loadSet: LoadSetManifestReaderSchema,
});

/** Version literal for schema-v1 compaction-seed envelopes. */
export type CompactionSeedSchemaVersion = z.infer<typeof COMPACTION_SEED_FIELDS.schemaVersion>;

/** Session lifecycle type captured by the seed when a WU is active. */
export type CompactionSeedSessionType = z.infer<typeof SESSION_TYPE_SCHEMA>;

/** Schema-v1 compaction seed derived from its strict producer authority. */
export type CompactionSeed = z.infer<typeof CompactionSeedSchema>;

/** Exact entering-checkout and marker-parent facts retained by schema-v1 seeds. */
export type CompactionSeedLocusHint = z.infer<typeof CompactionSeedLocusHintSchema>;

/** Complete field set compared when auditing one locus-generation hint. */
export const COMPACTION_SEED_LOCUS_HINT_FIELDS = Object.freeze(
  Object.keys(CompactionSeedLocusHintSchema.shape) as (keyof CompactionSeedLocusHint)[],
);

type DerivedLocusProbe =
  | { ok: true; value: DerivedLocusFrame }
  | { ok: false; error: unknown };

/** Derive exact checkout-local recovery facts from the shared entering frame. */
export function deriveCompactionSeedLocusHint(
  probe: DerivedLocusProbe,
): CompactionSeedLocusHint | null {
  if (!probe.ok || probe.value.entering.kind !== "selected") return null;
  const row = probe.value.entering.row;
  if (row.kind === "unresolved-checkout") return null;
  return {
    checkoutPath: row.checkout.path,
    parentCheckoutPath: row.parentCheckoutPath,
  };
}

/** Parse/validation failure for a compaction-seed JSON boundary. */
export interface CompactionSeedSchemaError {
  /** Error category for callers that need to branch without parsing prose. */
  kind: "malformed-json" | "schema-version-mismatch" | "invalid-schema";
  /** Human-readable failure detail including normalized issue paths. */
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

/**
 * Parse and validate a JSON-encoded compaction seed.
 *
 * @param content - Raw JSON file content
 * @returns The canonical typed seed or a categorized schema error
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
    return invalidSchema("compaction seed does not match schema v1");
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

  const result = CompactionSeedReaderSchema.safeParse(parsed);
  if (!result.success) {
    return invalidSchema(`compaction seed does not match schema v1: ${formatIssues(result.error.issues)}`);
  }
  return { ok: true, seed: result.data };
}

/**
 * Serialize a strict producer seed as stable pretty JSON.
 *
 * @param seed - Producer value to validate and serialize
 * @returns Pretty JSON with a trailing newline for file writes
 */
export function stringifyCompactionSeed(seed: CompactionSeed): string {
  assertCompactionSeed(seed);
  return `${JSON.stringify(seed, null, 2)}\n`;
}

/**
 * Test whether a value satisfies the strict producer contract.
 *
 * @param value - Unverified producer value
 * @returns Whether the complete strict schema accepts the value
 */
export function isCompactionSeed(value: unknown): value is CompactionSeed {
  return CompactionSeedSchema.safeParse(value).success;
}

/**
 * Assert that a value satisfies the strict schema-v1 producer contract.
 *
 * @param value - Unverified producer value
 * @throws When the version or record shape is invalid
 */
export function assertCompactionSeed(value: unknown): asserts value is CompactionSeed {
  if (!isRecord(value) || value.schemaVersion !== COMPACTION_SEED_SCHEMA_VERSION) {
    throw new Error(
      `compaction-seed: schemaVersion must be ${COMPACTION_SEED_SCHEMA_VERSION}, `
      + `got ${String(getSchemaVersion(value))}`,
    );
  }
  const result = CompactionSeedSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`compaction-seed: ${formatIssues(result.error.issues)}`);
  }
}

function invalidSchema(message: string): CompactionSeedParseResult {
  return { ok: false, error: { kind: "invalid-schema", message } };
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((issue) => {
    const path = issue.path.length === 0 ? "<root>" : issue.path.map(String).join(".");
    return `${path}: ${issue.message}`;
  }).join("; ");
}

function getSchemaVersion(value: unknown): unknown {
  return isRecord(value) ? value.schemaVersion : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRepositoryRelativePath(value: string): boolean {
  if (
    value.length === 0
    || value.includes("\\")
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
