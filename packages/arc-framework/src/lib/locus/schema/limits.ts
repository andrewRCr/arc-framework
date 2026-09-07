/** Shared size and scalar limits for locus contracts. */

import { isAbsolute as isNativeAbsolute, posix, win32 } from "node:path";

import { z } from "zod";

/** Maximum persisted ARC JSON payload shared by the surviving scalar schemas. */
export const MAX_LOCUS_JSON_BYTES = 256 * 1024;
/** Maximum serialized checkout-path length. */
export const MAX_LOCUS_PATH_CHARS = 32_768;
/** Maximum opaque diagnostic or forward-compatible scalar length. */
export const MAX_LOCUS_OPAQUE_CHARS = 4_096;

/** Bounded non-empty opaque text. */
export const LocusOpaqueTextSchema = z.string().min(1).max(MAX_LOCUS_OPAQUE_CHARS);
/** Canonical SHA-256 digest grammar. */
export const LocusDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
/** At-least-128-bit lowercase hexadecimal or unpadded base64url token. */
export const LocusTokenSchema = z.string().max(512).refine((value) =>
  /^(?:[0-9a-f]{32,}|[A-Za-z0-9_-]{22,})$/u.test(value), {
  error: "Token must encode at least 128 bits as lowercase hex or unpadded base64url",
});
/** UTC RFC 3339 instant. */
export const LocusTimestampSchema = z.iso.datetime({ offset: false });
/** Git object identity used at preservation boundaries. */
export const LocusGitOidSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
/** Cross-platform absolute path spelling. */
export const LocusAbsolutePathSchema = z.string()
  .min(1)
  .max(MAX_LOCUS_PATH_CHARS)
  .refine((value) => !value.includes("\0") && isAbsolutePath(value), {
    error: "Path must be an absolute POSIX, drive-qualified Windows, or UNC path",
  });

function isAbsolutePath(value: string): boolean {
  return posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || isNativeAbsolute(value);
}
