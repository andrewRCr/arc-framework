/**
 * Release-wrapper setup marker storage.
 *
 * Stores per-developer, per-machine harness setup posture at
 * `.arc/user/{identity}/.internal/release-setup.json`. Missing marker files
 * read as an empty schema-v1 marker so setup and status callers can treat
 * "not installed yet" as ordinary state.
 *
 * @module
 */

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteJson } from "../fs.js";

export interface MarkerPathContext {
  cwd: string;
  identity: string;
}

export interface MarkerContext {
  cwd: string;
  identity: string | null;
}

export type HarnessMode = "default-prompt" | "bypass";

export interface HarnessEntry {
  name: string;
  mode: HarnessMode;
  installedAt: string;
}

export interface MarkerSchemaV1 {
  schemaVersion: 1;
  harnesses: HarnessEntry[];
}

export interface MarkerStorageError {
  kind:
    | "malformed-json"
    | "schema-version-mismatch"
    | "invalid-schema"
    | "io"
    | "identity-missing";
  message: string;
  path?: string;
  actualVersion?: unknown;
  cause?: Error;
}

export type MarkerReadResult =
  | { ok: true; marker: MarkerSchemaV1 }
  | { ok: false; error: MarkerStorageError };

export type MarkerWriteResult = MarkerReadResult;

/** Empty schema-v1 marker value used when no marker file exists yet. */
export function emptyMarker(): MarkerSchemaV1 {
  return { schemaVersion: 1, harnesses: [] };
}

/**
 * Resolve the release setup marker path for the given identity, anchored at
 * `cwd`. Pure path math — does not touch the filesystem.
 *
 * @param ctx - Repository root and identity used for user workspace pathing
 * @returns Absolute marker file path under `.arc/user/{identity}/.internal/`
 */
export function resolveMarkerPath(ctx: MarkerPathContext): string {
  return join(ctx.cwd, ".arc", "user", ctx.identity, ".internal", "release-setup.json");
}

/**
 * Ensure the marker parent directory (`.arc/user/{identity}/.internal/`)
 * exists. Idempotent: creates the directory tree on first call, no-op when
 * the directory already exists.
 *
 * @param ctx - Repository root and identity used for user workspace pathing
 */
export async function ensureMarkerParent(ctx: MarkerPathContext): Promise<void> {
  const parent = join(ctx.cwd, ".arc", "user", ctx.identity, ".internal");
  await mkdir(parent, { recursive: true });
}

/**
 * Read the release setup marker. Missing files and missing identities return
 * the empty schema-v1 marker.
 *
 * @param ctx - Repository root and optional identity used for marker lookup
 * @returns Parsed marker, empty default, or a typed read error
 */
export async function readMarker(ctx: MarkerContext): Promise<MarkerReadResult> {
  if (ctx.identity === null) {
    return { ok: true, marker: emptyMarker() };
  }

  const path = resolveMarkerPath({ cwd: ctx.cwd, identity: ctx.identity });
  try {
    const content = await readFile(path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: "malformed-json",
          message: "release setup marker contains malformed JSON",
          path,
          cause: err instanceof Error ? err : new Error(String(err)),
        },
      };
    }

    if (!hasSchemaVersion(parsed, 1)) {
      return {
        ok: false,
        error: {
          kind: "schema-version-mismatch",
          message: `release setup marker schemaVersion must be 1, got ${String(getSchemaVersion(parsed))}`,
          path,
          actualVersion: getSchemaVersion(parsed),
        },
      };
    }

    if (!isMarkerSchemaV1(parsed)) {
      return {
        ok: false,
        error: {
          kind: "invalid-schema",
          message: "release setup marker does not match schema v1",
          path,
        },
      };
    }

    return { ok: true, marker: parsed };
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { ok: true, marker: emptyMarker() };
    }
    return {
      ok: false,
      error: {
        kind: "io",
        message: "failed to read release setup marker",
        path,
        cause: err instanceof Error ? err : new Error(String(err)),
      },
    };
  }
}

/**
 * Add a harness entry when absent, or replace the existing entry with the
 * same `name`. Other harness entries are preserved in their existing order.
 *
 * @param ctx - Repository root and identity used for marker lookup and write
 * @param entry - Harness setup entry to append or replace by name
 * @returns Updated marker or a typed read/write error
 */
export async function upsertHarness(
  ctx: MarkerContext,
  entry: HarnessEntry,
): Promise<MarkerWriteResult> {
  const pathCtx = requireIdentity(ctx);
  if (!pathCtx.ok) return pathCtx;

  const current = await readMarker(ctx);
  if (!current.ok) return current;

  const index = current.marker.harnesses.findIndex((harness) => harness.name === entry.name);
  const harnesses = [...current.marker.harnesses];
  if (index === -1) {
    harnesses.push(entry);
  } else {
    harnesses[index] = entry;
  }

  return writeMarker(pathCtx.ctx, {
    schemaVersion: current.marker.schemaVersion,
    harnesses,
  });
}

/**
 * Remove a harness entry by `name`. Missing names are a no-op success that
 * preserves the current marker.
 *
 * @param ctx - Repository root and identity used for marker lookup and write
 * @param name - Harness name to remove
 * @returns Updated marker or a typed read/write error
 */
export async function removeHarness(
  ctx: MarkerContext,
  name: string,
): Promise<MarkerWriteResult> {
  const pathCtx = requireIdentity(ctx);
  if (!pathCtx.ok) return pathCtx;

  const current = await readMarker(ctx);
  if (!current.ok) return current;

  const harnesses = current.marker.harnesses.filter((harness) => harness.name !== name);
  if (harnesses.length === current.marker.harnesses.length) {
    return current;
  }

  return writeMarker(pathCtx.ctx, {
    schemaVersion: current.marker.schemaVersion,
    harnesses,
  });
}

/**
 * Return whether a value is a supported harness setup mode.
 *
 * @param value - Unverified value from caller or parsed JSON
 * @returns Whether `value` is a schema-v1 harness mode
 */
export function isHarnessMode(value: unknown): value is HarnessMode {
  return value === "default-prompt" || value === "bypass";
}

/**
 * Runtime guard for one schema-v1 harness entry.
 *
 * @param value - Unverified value from caller or parsed JSON
 * @returns Whether `value` is a valid schema-v1 harness entry
 */
export function isHarnessEntry(value: unknown): value is HarnessEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string"
    && isHarnessMode(entry.mode)
    && typeof entry.installedAt === "string";
}

/**
 * Runtime guard for the schema-v1 marker envelope.
 *
 * @param value - Unverified value from caller or parsed JSON
 * @returns Whether `value` is a valid schema-v1 marker envelope
 */
export function isMarkerSchemaV1(value: unknown): value is MarkerSchemaV1 {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Record<string, unknown>;
  return marker.schemaVersion === 1
    && Array.isArray(marker.harnesses)
    && marker.harnesses.every(isHarnessEntry);
}

async function writeMarker(
  ctx: MarkerPathContext,
  marker: MarkerSchemaV1,
): Promise<MarkerWriteResult> {
  const path = resolveMarkerPath(ctx);
  try {
    await ensureMarkerParent(ctx);
    await atomicWriteJson(path, marker);
    return { ok: true, marker };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "io",
        message: "failed to write release setup marker",
        path,
        cause: err instanceof Error ? err : new Error(String(err)),
      },
    };
  }
}

function requireIdentity(ctx: MarkerContext):
  | { ok: true; ctx: MarkerPathContext }
  | { ok: false; error: MarkerStorageError } {
  if (ctx.identity !== null) {
    return { ok: true, ctx: { cwd: ctx.cwd, identity: ctx.identity } };
  }
  return {
    ok: false,
    error: {
      kind: "identity-missing",
      message: "release setup marker writes require arc.identity",
    },
  };
}

function hasSchemaVersion(value: unknown, version: number): boolean {
  return getSchemaVersion(value) === version;
}

function getSchemaVersion(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>).schemaVersion;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
