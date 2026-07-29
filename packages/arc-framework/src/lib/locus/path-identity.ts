/** Lexical checkout spelling normalization and record identity. */

import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";

import { MAX_LOCUS_PATH_CHARS } from "./schema/limits.js";

export type PathFlavor = "posix" | "windows";

export interface LocusPathIdentity {
  readonly normalizedPath: string;
  readonly digest: string;
  readonly recordId: `sha256:${string}`;
}

/**
 * Normalize an absolute checkout spelling without consulting the filesystem.
 *
 * @param path - Absolute checkout spelling to normalize.
 * @param flavor - Lexical path rules to apply.
 * @returns The normalized spelling used for record identity.
 */
export function normalizeCheckoutPath(path: string, flavor: PathFlavor): string {
  if (path.length === 0 || path.length > MAX_LOCUS_PATH_CHARS || path.includes("\0")) {
    throw new Error("Checkout path is empty, oversized, or contains NUL");
  }

  if (flavor === "posix") {
    if (!posix.isAbsolute(path) || path.includes("\\")) {
      throw new Error("Checkout path must be an absolute POSIX spelling");
    }
    return removeNonRootTrailingSeparator(posix.normalize(path), "/");
  }

  const windowsAbsolute = /^[A-Za-z]:[\\/]/u.test(path)
    || /^\\\\(?:\?\\)?[^\\/]+[\\/]/u.test(path);
  if (!windowsAbsolute || path.startsWith("/")) {
    throw new Error("Checkout path must be an absolute Windows drive or UNC spelling");
  }
  const normalized = win32.normalize(path).replaceAll("\\", "/");
  return removeNonRootTrailingSeparator(normalized, windowsRoot(normalized));
}

/**
 * Derive the tamper-evident record identity from normalized UTF-8 bytes.
 *
 * @param path - Absolute checkout spelling to identify.
 * @param flavor - Lexical path rules to apply before hashing.
 * @returns The normalized path, lowercase SHA-256 digest, and prefixed record ID.
 */
export function deriveLocusRecordId(path: string, flavor: PathFlavor): LocusPathIdentity {
  const normalizedPath = normalizeCheckoutPath(path, flavor);
  const digest = createHash("sha256").update(Buffer.from(normalizedPath, "utf8")).digest("hex");
  return { normalizedPath, digest, recordId: `sha256:${digest}` };
}

function removeNonRootTrailingSeparator(path: string, root: string): string {
  return path !== root && path.endsWith("/") ? path.replace(/\/+$/u, "") : path;
}

function windowsRoot(path: string): string {
  if (/^[A-Za-z]:\/$/u.test(path)) return path;
  if (path.startsWith("//?/")) {
    const drive = path.match(/^\/\/\?\/[A-Za-z]:\//u)?.[0];
    if (drive !== undefined) return drive;
  }
  if (path.startsWith("//")) {
    const parts = path.split("/");
    if (parts.length >= 4) return `//${parts[2]}/${parts[3]}`;
  }
  return "";
}
