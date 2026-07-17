/**
 * Filesystem-key codec and adapter-owned namespace for retirement records.
 *
 * Only canonical receipt digests cross the path boundary. Subject names and
 * branch text never participate in record-path construction.
 */

import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";

/** Repository-relative namespace owned by the in-repo authority adapter. */
export const RETIREMENT_RECORD_NAMESPACE = ".arc/.internal/retirement-receipts";

/** Filesystem-safe bijective spelling of a canonical digest. */
export type RetirementRecordKey = `sha256-${string}`;

const RECORD_KEY_PATTERN = /^sha256-([0-9a-f]{64})$/u;

/** Minimal filesystem boundary for creating the namespace and writing records. */
export interface RetirementRecordFs {
  lstat(path: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string, options: { flag: "wx" }): Promise<void>;
}

/** Production retirement-record filesystem adapter. */
export const nodeRetirementRecordFs: RetirementRecordFs = {
  lstat,
  mkdir,
  writeFile: (path, content, options) => writeFile(path, content, { encoding: "utf8", ...options }),
};

/**
 * Encode a canonical digest as its filesystem-safe record key.
 *
 * @param digest - Valid `sha256:<64-lower-hex>` digest
 * @returns The bijective `sha256-<64-lower-hex>` key
 */
export function encodeRetirementRecordKey(digest: CanonicalDigest): RetirementRecordKey {
  if (!isCanonicalDigest(digest)) throw new Error("invalid canonical digest for retirement record key");
  return `sha256-${digest.slice("sha256:".length)}`;
}

/**
 * Decode a record key back to its canonical digest.
 *
 * @param key - Candidate filesystem key
 * @returns The canonical digest represented by the key
 */
export function decodeRetirementRecordKey(key: string): CanonicalDigest {
  const match = RECORD_KEY_PATTERN.exec(key);
  if (match === null) throw new Error(`invalid retirement record key: ${JSON.stringify(key)}`);
  return `sha256:${match[1]}`;
}

/**
 * Resolve one record path beneath the adapter-owned namespace.
 *
 * @param cwd - Repository root
 * @param receiptId - Canonical receipt digest
 * @returns Absolute path to the record JSON file
 */
export function resolveRetirementRecordPath(cwd: string, receiptId: CanonicalDigest): string {
  return join(cwd, resolveRetirementRecordRelativePath(receiptId));
}

/**
 * Resolve the repository-relative path staged with a retirement transition.
 *
 * @param receiptId - Canonical receipt digest
 * @returns POSIX repository-relative record path
 */
export function resolveRetirementRecordRelativePath(receiptId: CanonicalDigest): string {
  return `${RETIREMENT_RECORD_NAMESPACE}/${encodeRetirementRecordKey(receiptId)}.json`;
}

/**
 * Write one record, creating the adapter namespace only when the write occurs.
 *
 * @param cwd - Repository root
 * @param receiptId - Canonical record identity
 * @param content - Complete record bytes
 * @param fs - Injected filesystem boundary
 */
export async function writeRetirementRecord(
  cwd: string,
  receiptId: CanonicalDigest,
  content: string,
  fs: RetirementRecordFs = nodeRetirementRecordFs,
): Promise<void> {
  for (const path of [
    join(cwd, ".arc"),
    join(cwd, ".arc", ".internal"),
    join(cwd, RETIREMENT_RECORD_NAMESPACE),
  ]) {
    await ensureRealDirectory(path, fs);
  }
  await fs.writeFile(resolveRetirementRecordPath(cwd, receiptId), content, { flag: "wx" });
}

async function ensureRealDirectory(path: string, fs: RetirementRecordFs): Promise<void> {
  try {
    const entry = await fs.lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`Retirement record parent is not a real directory: ${path}`);
    }
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
    try {
      await fs.mkdir(path, { recursive: false });
    } catch (mkdirError) {
      if ((mkdirError as { code?: unknown }).code !== "EEXIST") throw mkdirError;
      const entry = await fs.lstat(path);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error(`Retirement record parent is not a real directory: ${path}`, { cause: mkdirError });
      }
    }
  }
}
