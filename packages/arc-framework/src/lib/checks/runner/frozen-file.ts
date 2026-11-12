/** Bounded read-only verification of regular files and stable pathname bindings. */
import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import type { EnvironmentCaptureIO, EnvironmentInputFile } from "../environment-file.js";

/** Open and pathname observations required to verify a captured file. */
export interface FrozenFileVerificationIO {
  files: Pick<EnvironmentCaptureIO, "openInput">;
  lstat(path: string): Promise<BigIntStats>;
}

/** Captured byte identity, optionally including source permission fidelity. */
export interface FrozenFileIdentity { readonly bytes: number; readonly digest: string; readonly mode?: number }

/** Path-free explanation of a failed file verification. */
export class FrozenFileVerificationError extends Error {}

/** Compare regular-file metadata observed through a pathname or opened handle. */
export function sameFrozenFileMetadata(before: BigIntStats, after: BigIntStats): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino && before.mode === after.mode
    && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

interface Verification {
  io: FrozenFileVerificationIO; input: EnvironmentInputFile; path: string; expected: FrozenFileIdentity; before: BigIntStats;
}

async function verifyOpenedFile({ io, input, path, expected, before }: Verification): Promise<void> {
  if (!sameFrozenFileMetadata(before, await input.stat())) throw new FrozenFileVerificationError("file changed during verification");
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  for (;;) {
    const count = await input.read(buffer);
    if (count === 0) break;
    if (bytes > expected.bytes - count) throw new FrozenFileVerificationError("file size no longer matches the captured input");
    bytes += count;
    hash.update(buffer.subarray(0, count));
  }
  if (bytes !== expected.bytes || `sha256:${hash.digest("hex")}` !== expected.digest) {
    throw new FrozenFileVerificationError("file bytes no longer match the captured input");
  }
  if (!sameFrozenFileMetadata(before, await input.stat()) || !sameFrozenFileMetadata(before, await io.lstat(path))) {
    throw new FrozenFileVerificationError("file changed during verification");
  }
}

/** Verify exact bytes and optional permissions while closing the observed handle on every path. */
export async function verifyFrozenFile(io: FrozenFileVerificationIO, path: string, expected: FrozenFileIdentity): Promise<void> {
  const before = await io.lstat(path);
  if (!before.isFile() || before.size !== BigInt(expected.bytes)
    || (expected.mode !== undefined && Number(before.mode & 0o7777n) !== expected.mode)) {
    throw new FrozenFileVerificationError("file kind, permissions or size no longer match the captured input");
  }
  const input = await io.files.openInput(path);
  const verified = await verifyOpenedFile({ io, input, path, expected, before }).then(
    () => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
  const closed = await Promise.allSettled([Promise.resolve().then(() => input.close())]);
  if (!verified.ok) throw verified.error;
  if (closed.some(result => result.status === "rejected")) throw new FrozenFileVerificationError("file verification handle could not be closed");
}
