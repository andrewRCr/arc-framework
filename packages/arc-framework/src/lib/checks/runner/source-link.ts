/** Freeze links after certifying containment and caller-side link fidelity. */
import type { BigIntStats } from "node:fs";
import type { SourceManifestEntry } from "./contract-source.js";
import type { SourcePresentationIO } from "./source-io.js";
import { assertSourceLinkTarget, decodeSourceLinkTarget } from "./source-link-target.js";
import { SourceCaptureError } from "./source-error.js";

async function linkType(io: SourcePresentationIO, source: string): Promise<"file" | "dir"> {
  try { return (await io.stat(source)).isDirectory() ? "dir" : "file"; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR" && code !== "ELOOP") throw error;
    if (io.platform === "win32") throw new SourceCaptureError("Cannot establish the Windows file/directory type of an unresolved source link");
    return "file";
  }
}

function sameLink(before: BigIntStats, after: BigIntStats): boolean {
  return after.isSymbolicLink() && before.dev === after.dev && before.ino === after.ino && before.mode === after.mode
    && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

function manifestTarget(platform: NodeJS.Platform, target: string): string {
  return platform === "win32" ? target.replaceAll("\\", "/") : target;
}

/** Preserve a contained relative link, encoding Windows target separators portably. */
export async function freezeSourceLink(io: SourcePresentationIO, root: string, source: string,
  destination: string, path: string, before: BigIntStats): Promise<SourceManifestEntry> {
  const target = decodeSourceLinkTarget(await io.readlink(source));
  await assertSourceLinkTarget(io, root, source, target);
  await io.symlink(target, destination, await linkType(io, source));
  if (!sameLink(before, await io.lstat(source)) || decodeSourceLinkTarget(await io.readlink(source)) !== target) {
    throw new SourceCaptureError("Source link changed during capture");
  }
  await assertSourceLinkTarget(io, root, source, target);
  if (!(await io.lstat(destination)).isSymbolicLink() || decodeSourceLinkTarget(await io.readlink(destination)) !== target) {
    throw new SourceCaptureError("Source link cannot be preserved literally");
  }
  return { path, kind: "symlink", target: manifestTarget(io.platform, target) };
}

/** Verify a captured literal link and its contained target chain without changing either. */
export async function verifySourceLink(io: SourcePresentationIO, root: string, source: string,
  entry: Extract<SourceManifestEntry, { kind: "symlink" }>): Promise<void> {
  const before = await io.lstat(source);
  if (!before.isSymbolicLink()) throw new SourceCaptureError("Source link kind or target no longer match the manifest");
  const target = decodeSourceLinkTarget(await io.readlink(source));
  if (manifestTarget(io.platform, target) !== entry.target) {
    throw new SourceCaptureError("Source link kind or target no longer match the manifest");
  }
  await assertSourceLinkTarget(io, root, source, target);
  await linkType(io, source);
  if (!sameLink(before, await io.lstat(source)) || decodeSourceLinkTarget(await io.readlink(source)) !== target) {
    throw new SourceCaptureError("Source link changed during verification");
  }
}
