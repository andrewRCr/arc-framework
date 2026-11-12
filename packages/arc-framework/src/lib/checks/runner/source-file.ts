/** Stable raw file copying with pathname, opened-handle and permission fidelity. */
import type { BigIntStats } from "node:fs";
import { captureEnvironmentFile } from "../environment-file.js";
import type { SourceManifestEntry } from "./contract-source.js";
import type { SourcePresentationIO } from "./source-io.js";
import { SourceCaptureError } from "./source-error.js";
import { FrozenFileVerificationError, sameFrozenFileMetadata as sameFile, verifyFrozenFile } from "./frozen-file.js";

type SourceFileEntry = Extract<SourceManifestEntry, { kind: "file" }>;

/** Copy one regular file while ensuring both the opened object and its pathname remain stable. */
export async function freezeSourceFile(io: SourcePresentationIO, source: string, destination: string,
  path: string, before: BigIntStats): Promise<SourceManifestEntry> {
  if (!before.isFile()) throw new SourceCaptureError("Source entry is not a supported regular file or link");
  const files = { ...io.files, openInput: async (name: string) => {
    const input = await io.files.openInput(name);
    return { read: (buffer: Buffer) => input.read(buffer), close: () => input.close(), stat: async () => {
      const current = await input.stat();
      if (!sameFile(before, current)) throw new SourceCaptureError("Source file changed before or during capture");
      return current;
    } };
  } };
  const captured = await captureEnvironmentFile(files, source, destination);
  if (!sameFile(before, await io.lstat(source))) throw new SourceCaptureError("Source pathname changed during capture");
  const mode = Number(before.mode & 0o7777n);
  await io.chmod(destination, mode);
  const copied = await io.lstat(destination);
  if (!copied.isFile() || Number(copied.mode & 0o7777n) !== mode) throw new SourceCaptureError("Source permissions cannot be preserved");
  return { path, kind: "file", mode, digest: captured.digest, bytes: captured.bytes };
}

/** Verify raw bytes, permissions and stable pathname binding without creating a disposable copy. */
export async function verifySourceFile(io: SourcePresentationIO, source: string, entry: SourceFileEntry): Promise<void> {
  try { await verifyFrozenFile(io, source, entry); }
  catch (cause) {
    const reason = cause instanceof FrozenFileVerificationError ? `Source ${cause.message}` : "Source file could not be verified";
    throw new SourceCaptureError(reason, { cause });
  }
}
