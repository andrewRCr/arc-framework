/** Stable raw file copying with pathname, opened-handle and permission fidelity. */
import type { BigIntStats } from "node:fs";
import { captureEnvironmentFile } from "../environment-file.js";
import type { SourceManifestEntry } from "./contract-source.js";
import type { SourcePresentationIO } from "./source-io.js";
import { SourceCaptureError } from "./source-error.js";
import { createHash } from "node:crypto";
import type { EnvironmentInputFile } from "../environment-file.js";

type SourceFileEntry = Extract<SourceManifestEntry, { kind: "file" }>;

function sameFile(before: BigIntStats, after: BigIntStats): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino && before.mode === after.mode
    && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

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

interface FileVerification {
  io: SourcePresentationIO; input: EnvironmentInputFile; source: string; entry: SourceFileEntry; before: BigIntStats;
}

async function verifyOpenedFile({ io, input, source, entry, before }: FileVerification): Promise<void> {
  if (!sameFile(before, await input.stat())) throw new SourceCaptureError("Source file changed during verification");
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  for (;;) {
    const count = await input.read(buffer);
    if (count === 0) break;
    if (bytes > entry.bytes - count) throw new SourceCaptureError("Source file size no longer matches the manifest");
    bytes += count;
    hash.update(buffer.subarray(0, count));
  }
  if (bytes !== entry.bytes || `sha256:${hash.digest("hex")}` !== entry.digest) {
    throw new SourceCaptureError("Source file bytes no longer match the manifest");
  }
  if (!sameFile(before, await input.stat()) || !sameFile(before, await io.lstat(source))) {
    throw new SourceCaptureError("Source file changed during verification");
  }
}

/** Verify raw bytes, permissions and stable pathname binding without creating a disposable copy. */
export async function verifySourceFile(io: SourcePresentationIO, source: string, entry: SourceFileEntry): Promise<void> {
  const before = await io.lstat(source);
  if (!before.isFile() || Number(before.mode & 0o7777n) !== entry.mode || before.size !== BigInt(entry.bytes)) {
    throw new SourceCaptureError("Source file kind, permissions or size no longer match the manifest");
  }
  const input = await io.files.openInput(source);
  const verified = await verifyOpenedFile({ io, input, source, entry, before }).then(
    () => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
  const closed = await Promise.allSettled([input.close()]);
  if (!verified.ok) throw verified.error;
  if (closed.some(result => result.status === "rejected")) throw new SourceCaptureError("Source verification input could not be closed");
}
