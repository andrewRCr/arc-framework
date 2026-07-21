/** Bounded, exact-generation persistence for per-checkout locus records. */

import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

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

/** Read and validate one record without buffering beyond the configured cap. */
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
  if (isObject(decoded) && decoded.schemaVersion !== 1) {
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

/** Exclusively create a record without replacing any existing generation. */
export async function mintLocusRecord(options: {
  path: string;
  record: LocusRecordV1;
}): Promise<{ kind: "created"; bytes: Buffer } | { kind: "exists" }> {
  const bytes = serializeRecord(options.path, options.record);
  await mkdir(dirname(options.path), { recursive: true });
  try {
    await writeFile(options.path, bytes, { flag: "wx", mode: 0o600 });
    return { kind: "created", bytes };
  } catch (error) {
    if (errorCode(error) === "EEXIST") return { kind: "exists" };
    throw error;
  }
}

/** Atomically replace a record only while its exact byte generation remains current. */
export async function replaceLocusRecord(options: {
  path: string;
  expectedBytes: Buffer;
  record: LocusRecordV1;
}): Promise<{ kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }> {
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
    const recheck = await readFile(options.path);
    if (!recheck.equals(options.expectedBytes)) return { kind: "generation-mismatch" };
    await rename(temporaryPath, options.path);
    return { kind: "replaced", bytes };
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (errorCode(error) !== "ENOENT") throw error;
    });
  }
}

function serializeRecord(path: string, value: LocusRecordV1): Buffer {
  const record = LocusRecordV1Schema.parse(value);
  const match = /^locus-([0-9a-f]{64})\.json$/u.exec(basename(path));
  if (match?.[1] === undefined || record.recordId !== `sha256:${match[1]}`) {
    throw new Error("Record target and recordId do not match");
  }
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_LOCUS_JSON_BYTES) throw new Error("Locus record exceeds maximum size");
  return bytes;
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
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_LOCUS_JSON_BYTES) return { kind: "oversized" };
    return { kind: "bytes", bytes: buffer.subarray(0, bytesRead) };
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
