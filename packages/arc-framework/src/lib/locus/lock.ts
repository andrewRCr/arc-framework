/** Record-scoped exclusive lock with token-safe stale breaking. */

import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { verifyProcessAnchor, type ProcessInspector } from "./process-inspector.js";
import {
  LocusProcessAnchorSchema,
  LocusTimestampSchema,
  LocusTokenSchema,
  type LocusProcessAnchor,
} from "./schema/index.js";

const MAX_LOCK_BYTES = 64 * 1024;
const LocusLockHolderSchema = z.strictObject({
  token: LocusTokenSchema,
  anchor: LocusProcessAnchorSchema,
  createdAt: LocusTimestampSchema,
});

export type LocusLockHolder = z.infer<typeof LocusLockHolderSchema>;

export interface LocusLockHandle {
  readonly path: string;
  readonly token: string;
  readonly anchor: LocusProcessAnchor;
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
  anchor: LocusProcessAnchor;
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
      const liveness = await verifyProcessAnchor(observed.holder.anchor, options.inspector);
      if (liveness === "live") lastReason = "live";
      else if (liveness === "unknown") lastReason = "unknown";
      else {
        const broken = await breakDeadHolder({
          path: options.path,
          observed,
          inspector: options.inspector,
          breakerToken: token,
          beforeBreakRecheck: options.beforeBreakRecheck,
        });
        if (broken) continue;
        lastReason = "unknown";
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

async function breakDeadHolder(options: {
  path: string;
  observed: { kind: "valid"; holder: LocusLockHolder; bytes: Buffer };
  inspector: ProcessInspector;
  breakerToken: string;
  beforeBreakRecheck?: () => Promise<void>;
}): Promise<boolean> {
  const breakPath = `${options.path}.break`;
  const breakBytes = Buffer.from(options.breakerToken, "utf8");
  if (!await exclusiveCreate(breakPath, breakBytes)) return false;
  try {
    await options.beforeBreakRecheck?.();
    const current = await readLocusLockHolder(options.path);
    if (current.kind !== "valid" || !current.bytes.equals(options.observed.bytes)) return false;
    if (await verifyProcessAnchor(current.holder.anchor, options.inspector) !== "dead") return false;
    await unlink(options.path);
    return true;
  } catch (error) {
    return errorCode(error) === "ENOENT";
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
    const bytes = buffer.subarray(0, bytesRead);
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
