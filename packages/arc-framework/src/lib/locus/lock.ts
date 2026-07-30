/** Record-scoped exclusive lock with token-safe stale breaking. */

import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { verifyProcessAnchor, type ProcessInspector } from "./process-inspector.js";
import {
  LocusAnchorSchema,
  LocusTimestampSchema,
  LocusTokenSchema,
  type LocusAnchor,
} from "./schema/index.js";

const MAX_LOCK_BYTES = 64 * 1024;
const LocusLockHolderSchema = z.strictObject({
  token: LocusTokenSchema,
  anchor: LocusAnchorSchema,
  createdAt: LocusTimestampSchema,
});

export type LocusLockHolder = z.infer<typeof LocusLockHolderSchema>;

export interface LocusLockHandle {
  readonly path: string;
  readonly token: string;
  readonly anchor: LocusAnchor;
  readonly holderBytes: Buffer;
}

export type LocusLockAcquireResult =
  | { kind: "acquired"; handle: LocusLockHandle }
  | { kind: "refused"; reason: "live" | "unknown" | "timeout" };

export type LocusLockReadResult =
  | { kind: "valid"; holder: LocusLockHolder; bytes: Buffer }
  | { kind: "unknown" };

/** Serialize one strict holder generation. */
export function serializeLocusLockHolder(holder: LocusLockHolder): Buffer {
  return Buffer.from(JSON.stringify(LocusLockHolderSchema.parse(holder)), "utf8");
}

/** Acquire a record lock, breaking only a token-stable conclusively dead holder. */
export async function acquireLocusLock(options: {
  path: string;
  anchor: LocusAnchor;
  inspector: ProcessInspector;
  token?: string;
  timeoutMs?: number;
  retryIntervalMs?: number;
  beforeBreakRecheck?: () => Promise<void>;
}): Promise<LocusLockAcquireResult> {
  const token = options.token ?? randomBytes(16).toString("hex");
  const holderBytes = serializeLocusLockHolder({
    token,
    anchor: options.anchor,
    createdAt: new Date().toISOString(),
  });
  const deadline = Date.now() + (options.timeoutMs ?? 2_000);
  const interval = options.retryIntervalMs ?? 25;
  await mkdir(dirname(options.path), { recursive: true });

  for (;;) {
    if (await exclusiveCreate(options.path, holderBytes)) {
      return {
        kind: "acquired",
        handle: { path: options.path, token, anchor: options.anchor, holderBytes },
      };
    }

    const observed = await readLocusLockHolder(options.path);
    let lastReason: "live" | "unknown";
    if (observed.kind !== "valid") {
      lastReason = "unknown";
    } else {
      const liveness = observed.holder.anchor.kind === "unverifiable"
        ? "unknown"
        : await verifyProcessAnchor(observed.holder.anchor, options.inspector);
      if (liveness === "live") lastReason = "live";
      else if (liveness === "unknown") lastReason = "unknown";
      else {
        const broken = await breakDeadLocusLock({
          path: options.path,
          observed,
          inspector: options.inspector,
          breakerToken: token,
          breakerAnchor: options.anchor,
          beforeBreakRecheck: options.beforeBreakRecheck,
        });
        if (broken.kind === "broken" || broken.kind === "already-absent") {
          if (Date.now() >= deadline) return { kind: "refused", reason: "timeout" };
          continue;
        }
        lastReason = broken.kind === "live" ? "live" : "unknown";
      }
    }

    if (Date.now() >= deadline) return { kind: "refused", reason: lastReason };
    await delay(interval);
  }
}

/** Release only the exact serialized holder generation owned by this handle. */
export async function releaseLocusLock(
  handle: LocusLockHandle,
): Promise<{ kind: "released" } | { kind: "not-owner" } | { kind: "unknown" }> {
  let current: Buffer;
  try {
    current = await readFile(handle.path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { kind: "released" };
    return { kind: "unknown" };
  }
  if (!current.equals(handle.holderBytes)) return { kind: "not-owner" };
  try {
    await unlink(handle.path);
    return { kind: "released" };
  } catch (error) {
    return errorCode(error) === "ENOENT" ? { kind: "released" } : { kind: "unknown" };
  }
}

/** Check whether a handle still owns the exact serialized lock generation. */
export async function ownsLocusLock(handle: LocusLockHandle): Promise<boolean> {
  try {
    return (await readFile(handle.path)).equals(handle.holderBytes);
  } catch {
    return false;
  }
}

/** Break only an unchanged conclusively dead main holder through its secondary lock. */
export async function breakDeadLocusLock(options: {
  path: string;
  observed: { kind: "valid"; holder: LocusLockHolder; bytes: Buffer };
  inspector: ProcessInspector;
  breakerToken: string;
  breakerAnchor: LocusAnchor;
  beforeBreakRecheck?: () => Promise<void>;
}): Promise<{ kind: "broken" | "already-absent" | "generation-mismatch" | "live" | "unknown" }> {
  const breakPath = `${options.path}.break`;
  // The secondary holder is anchored like the main one: a breaker that exits
  // between this create and its release would otherwise leave bytes no later
  // breaker can distinguish from a live competitor, wedging the record for a
  // main holder already proven dead.
  const breakBytes = serializeLocusLockHolder({
    token: options.breakerToken,
    anchor: options.breakerAnchor,
    createdAt: new Date().toISOString(),
  });
  if (!await exclusiveCreate(breakPath, breakBytes)) {
    if (!await reclaimDeadBreaker(breakPath, options.inspector)) return { kind: "generation-mismatch" };
    if (!await exclusiveCreate(breakPath, breakBytes)) return { kind: "generation-mismatch" };
  }
  try {
    await options.beforeBreakRecheck?.();
    const current = await readLocusLockHolder(options.path);
    if (current.kind !== "valid" || !current.bytes.equals(options.observed.bytes)) {
      return { kind: "generation-mismatch" };
    }
    const liveness = current.holder.anchor.kind === "unverifiable"
      ? "unknown"
      : await verifyProcessAnchor(current.holder.anchor, options.inspector);
    if (liveness !== "dead") return { kind: liveness };
    await unlink(options.path);
    return { kind: "broken" };
  } catch (error) {
    return errorCode(error) === "ENOENT" ? { kind: "already-absent" } : { kind: "unknown" };
  } finally {
    await releaseExactFile(breakPath, breakBytes);
  }
}

/** Read one lock generation without granting authority to malformed bytes. */
export async function readLocusLockHolder(path: string): Promise<LocusLockReadResult> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.allocUnsafe(MAX_LOCK_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === 0 || bytesRead > MAX_LOCK_BYTES) return { kind: "unknown" };
    const bytes = Buffer.from(buffer.subarray(0, bytesRead));
    let decoded: unknown;
    try {
      decoded = JSON.parse(bytes.toString("utf8"));
    } catch {
      return { kind: "unknown" };
    }
    const parsed = LocusLockHolderSchema.safeParse(decoded);
    return parsed.success ? { kind: "valid", holder: parsed.data, bytes } : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  } finally {
    await handle?.close();
  }
}

/**
 * Remove secondary-lock residue whose breaker is conclusively dead.
 *
 * Only a readable, process-anchored holder proven dead is reclaimed, and only by
 * unlinking the exact bytes just observed — so a live breaker, an unverifiable
 * anchor, and malformed residue all keep excluding competitors, and a breaker
 * that replaces the residue between the read and the unlink keeps its own file.
 */
async function reclaimDeadBreaker(breakPath: string, inspector: ProcessInspector): Promise<boolean> {
  const residue = await readLocusLockHolder(breakPath);
  if (residue.kind !== "valid" || residue.holder.anchor.kind === "unverifiable") return false;
  if (await verifyProcessAnchor(residue.holder.anchor, inspector) !== "dead") return false;
  await releaseExactFile(breakPath, residue.bytes);
  return true;
}

async function exclusiveCreate(path: string, bytes: Buffer): Promise<boolean> {
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") return false;
    throw error;
  }
}

async function releaseExactFile(path: string, expected: Buffer): Promise<void> {
  try {
    if (!(await readFile(path)).equals(expected)) return;
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "code" in value
    && typeof (value as { code?: unknown }).code === "string"
    ? (value as { code: string }).code
    : undefined;
}
