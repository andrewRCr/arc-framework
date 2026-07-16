/**
 * Filesystem-key codec and adapter-owned namespace for retirement records.
 *
 * Only canonical receipt digests cross the path boundary. Subject names and
 * branch text never participate in record-path construction.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";

/** Repository-relative namespace owned by the in-repo authority adapter. */
export const RETIREMENT_RECORD_NAMESPACE = ".arc/.internal/retirement-receipts";

/** Filesystem-safe bijective spelling of a canonical digest. */
export type RetirementRecordKey = `sha256-${string}`;

const RECORD_KEY_PATTERN = /^sha256-([0-9a-f]{64})$/u;

/** Minimal filesystem boundary for creating the namespace and writing records. */
export interface RetirementRecordFs {
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string): Promise<void>;
}

/** Production retirement-record filesystem adapter. */
export const nodeRetirementRecordFs: RetirementRecordFs = {
  mkdir,
  writeFile: (path, content) => writeFile(path, content, "utf8"),
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
  return join(cwd, RETIREMENT_RECORD_NAMESPACE, `${encodeRetirementRecordKey(receiptId)}.json`);
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
  await fs.mkdir(join(cwd, RETIREMENT_RECORD_NAMESPACE), { recursive: true });
  await fs.writeFile(resolveRetirementRecordPath(cwd, receiptId), content);
}
