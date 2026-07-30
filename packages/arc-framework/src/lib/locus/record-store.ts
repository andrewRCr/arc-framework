/** Bounded, exact-generation persistence for per-checkout locus records. */

import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { ownsLocusLock, type LocusLockHandle } from "./lock.js";
import { deriveLocusRecordId, type PathFlavor } from "./path-identity.js";
import {
  MAX_LOCUS_JSON_BYTES,
  LocusRecordV1Schema,
  type LocusRecordV1,
} from "./schema/index.js";

export type LocusRecordReadResult =
  | { kind: "absent" }
  | { kind: "valid"; record: LocusRecordV1; bytes: Buffer }
  | { kind: "malformed"; message: string }
  | { kind: "unsupported"; schemaVersion: unknown }
  | { kind: "digest-mismatch" }
  | { kind: "oversized" }
  | { kind: "unreadable"; message: string };

/** Filesystem and entropy boundaries used to mint a locus record. */
export interface LocusRecordMintContext {
  mkdir: (path: string, options: { recursive: true }) => Promise<string | undefined>;
  writeFile: (
    path: string,
    bytes: Uint8Array,
    options: { flag: "wx"; mode: number },
  ) => Promise<void>;
  link: (existingPath: string, newPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  randomId: () => string;
}

/** Exclusively creates one locus-record generation. */
export type LocusRecordMinter = (options: {
  path: string;
  record: LocusRecordV1;
}) => Promise<{ kind: "created"; bytes: Buffer } | { kind: "exists" }>;

/**
 * Read and validate one record without buffering beyond the configured cap.
 *
 * @param options - Record path, expected path digest, and lexical path flavor.
 * @returns The exact valid byte generation or a bounded read/validation verdict.
 */
export async function readLocusRecord(options: {
  path: string;
  expectedDigest: string;
  pathFlavor: PathFlavor;
}): Promise<LocusRecordReadResult> {
  if (!/^[0-9a-f]{64}$/u.test(options.expectedDigest)
    || basename(options.path) !== `locus-${options.expectedDigest}.json`) {
    return { kind: "digest-mismatch" };
  }

  const bounded = await boundedRead(options.path);
  if (bounded.kind !== "bytes") return bounded;
  let decoded: unknown;
  try {
    decoded = JSON.parse(bounded.bytes.toString("utf8"));
  } catch (error) {
    return { kind: "malformed", message: safeMessage(error, "Invalid JSON") };
  }
  if (isObject(decoded) && Object.hasOwn(decoded, "schemaVersion") && decoded.schemaVersion !== 1) {
    return { kind: "unsupported", schemaVersion: decoded.schemaVersion };
  }
  const parsed = LocusRecordV1Schema.safeParse(decoded);
  if (!parsed.success) return { kind: "malformed", message: parsed.error.message };

  let identity;
  try {
    identity = deriveLocusRecordId(parsed.data.checkoutPath, options.pathFlavor);
  } catch (error) {
    return { kind: "malformed", message: safeMessage(error, "Invalid checkout path") };
  }
  if (identity.digest !== options.expectedDigest || identity.recordId !== parsed.data.recordId) {
    return { kind: "digest-mismatch" };
  }
  return { kind: "valid", record: parsed.data, bytes: bounded.bytes };
}

/**
 * Create an exclusive locus-record minter over explicit system boundaries.
 *
 * @param context - Filesystem operations and collision-resistant identifier source.
 * @returns A minter that atomically publishes complete record generations.
 */
export function createLocusRecordMinter(context: LocusRecordMintContext): LocusRecordMinter {
  return async (options) => {
    const bytes = serializeRecord(options.path, options.record);
    const directory = dirname(options.path);
    const temporaryPath = join(
      directory,
      `.${basename(options.path)}.${context.randomId()}.tmp`,
    );
    await context.mkdir(directory, { recursive: true });

    try {
      await context.writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        await context.unlink(temporaryPath).catch(() => undefined);
      }
      throw error;
    }

    try {
      await context.link(temporaryPath, options.path);
      return { kind: "created", bytes };
    } catch (error) {
      if (errorCode(error) === "EEXIST") return { kind: "exists" };
      throw error;
    } finally {
      await context.unlink(temporaryPath).catch(() => undefined);
    }
  };
}

const nodeLocusRecordMinter = createLocusRecordMinter({
  mkdir,
  writeFile,
  link,
  unlink,
  randomId: randomUUID,
});
const recordMutationTails = new Map<string, Promise<void>>();

/**
 * Exclusively publish a complete record without replacing an existing generation.
 *
 * @param options - Target record path and schema-validated record value.
 * @returns The created byte generation, or `exists` when the target is occupied.
 */
export async function mintLocusRecord(
  options: Parameters<LocusRecordMinter>[0],
): ReturnType<LocusRecordMinter> {
  return nodeLocusRecordMinter(options);
}

/** Atomically replace a record only while its exact byte and lock generations remain current. */
export async function replaceLocusRecord(options: {
  path: string;
  expectedBytes: Buffer;
  record: LocusRecordV1;
  lock: LocusLockHandle;
  beforeReplaceRecheck?: () => Promise<void>;
}): Promise<{ kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }> {
  return withSerializedRecordMutation(options.lock, async () => {
    if (!isLockForRecord(options.path, options.lock) || !await ownsLocusLock(options.lock)) {
      return { kind: "generation-mismatch" };
    }
    let current: Buffer;
    try {
      current = await readFile(options.path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { kind: "generation-mismatch" };
      throw error;
    }
    if (!current.equals(options.expectedBytes)) return { kind: "generation-mismatch" };

    const bytes = serializeRecord(options.path, options.record);
    const temporaryPath = `${options.path}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
      await options.beforeReplaceRecheck?.();
      let recheck: Buffer;
      try {
        recheck = await readFile(options.path);
      } catch (error) {
        if (errorCode(error) === "ENOENT") return { kind: "generation-mismatch" };
        throw error;
      }
      if (!recheck.equals(options.expectedBytes) || !await ownsLocusLock(options.lock)) {
        return { kind: "generation-mismatch" };
      }
      await rename(temporaryPath, options.path);
      return { kind: "replaced", bytes };
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  });
}

/** Remove a record only while its exact byte and lock generations remain current. */
export async function removeLocusRecord(options: {
  path: string;
  expectedBytes: Buffer;
  lock: LocusLockHandle;
}): Promise<{ kind: "removed" } | { kind: "generation-mismatch" }> {
  return withSerializedRecordMutation(options.lock, async () => {
    if (!isLockForRecord(options.path, options.lock) || !await ownsLocusLock(options.lock)) {
      return { kind: "generation-mismatch" };
    }
    let current: Buffer;
    try {
      current = await readFile(options.path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { kind: "generation-mismatch" };
      throw error;
    }
    if (!current.equals(options.expectedBytes) || !await ownsLocusLock(options.lock)) {
      return { kind: "generation-mismatch" };
    }
    try {
      await unlink(options.path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { kind: "generation-mismatch" };
      throw error;
    }
    return { kind: "removed" };
  });
}

async function withSerializedRecordMutation<T>(
  lock: LocusLockHandle,
  operation: () => Promise<T>,
): Promise<T> {
  const key = resolve(lock.path);
  const previous = recordMutationTails.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const current = previous.then(() => gate);
  recordMutationTails.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (recordMutationTails.get(key) === current) recordMutationTails.delete(key);
  }
}

function isLockForRecord(recordPath: string, lock: LocusLockHandle): boolean {
  const digest = recordDigest(recordPath);
  if (digest === null) return false;
  const expected = join(dirname(recordPath), ".locks", `locus-${digest}.lock`);
  return resolve(lock.path) === resolve(expected);
}

function serializeRecord(path: string, value: LocusRecordV1): Buffer {
  const record = LocusRecordV1Schema.parse(value);
  const digest = recordDigest(path);
  if (digest === null || record.recordId !== `sha256:${digest}`) {
    throw new Error("Record target and recordId do not match");
  }
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_LOCUS_JSON_BYTES) throw new Error("Session locus record exceeds maximum size");
  return bytes;
}

function recordDigest(path: string): string | null {
  return /^locus-([0-9a-f]{64})\.json$/u.exec(basename(path))?.[1] ?? null;
}

async function boundedRead(path: string): Promise<
  { kind: "bytes"; bytes: Buffer }
  | { kind: "absent" }
  | { kind: "oversized" }
  | { kind: "unreadable"; message: string }
> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.allocUnsafe(MAX_LOCUS_JSON_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_LOCUS_JSON_BYTES) return { kind: "oversized" };
    return { kind: "bytes", bytes: buffer.subarray(0, offset) };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { kind: "absent" };
    return { kind: "unreadable", message: safeMessage(error, "Record read failed") };
  } finally {
    await handle?.close();
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isObject(error) && typeof error.code === "string" ? error.code : undefined;
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
