/** Freeze literal links after certifying containment and caller-side link fidelity. */
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

/** Preserve a contained relative link literally, checking both source and copied link state. */
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
  return { path, kind: "symlink", target };
}
