/** Stable raw file copying with pathname, opened-handle and permission fidelity. */
import type { BigIntStats } from "node:fs";
import { captureEnvironmentFile } from "../environment-file.js";
import type { SourceManifestEntry } from "./contract-source.js";
import type { SourcePresentationIO } from "./source-io.js";
import { SourceCaptureError } from "./source-error.js";

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
