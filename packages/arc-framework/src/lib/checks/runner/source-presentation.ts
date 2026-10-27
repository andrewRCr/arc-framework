/** Freeze raw caller-side source presentation independently from canonical Git tree bytes. */
import type { SourceCoordinates, SourceManifest } from "./contract-source.js";
import { dirname, join, resolve } from "node:path";
import { decodeSourcePaths } from "./source-paths.js";
import { freezeSourceFile } from "./source-file.js";
import { freezeSourceLink } from "./source-link.js";
import { resolveSourceCwd } from "./source-cwd.js";
import { nodeSourcePresentationIO, type SourcePresentationIO } from "./source-io.js";
import { SourceCaptureError, sourceCaptureFailure } from "./source-error.js";
import { createSourceSpellingIndex } from "./source-spelling.js";
import { identifySourceManifest } from "./source-manifest.js";

/** Owned source presentation with its descriptor outside the project paths. */
export interface FrozenSourcePresentation {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifest: SourceManifest;
  readonly digest: `sha256:${string}`;
  readonly codePaths: ReadonlyMap<string, string>;
  remove(): Promise<void>;
}

/** Freeze a selected materialized path listing into owned source storage. */
export async function freezeSourcePresentation(root: string, paths: Uint8Array,
  coordinates: SourceCoordinates, io: SourcePresentationIO = nodeSourcePresentationIO): Promise<FrozenSourcePresentation> {
  let directory: string;
  try { directory = await io.files.createDirectory(); }
  catch (cause) { throw sourceCaptureFailure(cause); }
  const remove = () => io.files.removeDirectory(directory);
  try {
    const capturedRoot = join(directory, "root");
    await io.mkdir(capturedRoot);
    const manifest: SourceManifest = { version: 1, coordinates: { ...coordinates, merged: [...coordinates.merged] }, entries: [] };
    const codePaths = new Map<string, string>();
    const presentationPaths = new Set<string>();
    const spelling = createSourceSpellingIndex(io, root);
    for (const codePath of decodeSourcePaths(paths, io.platform)) {
      const path = await spelling.resolve(codePath);
      codePaths.set(codePath, path);
      if (presentationPaths.has(path)) continue;
      presentationPaths.add(path);
      const source = resolve(root, path);
      try { await resolveSourceCwd(root, dirname(source)); }
      catch (cause) { throw new SourceCaptureError("Source path parent is not a contained directory", { cause }); }
      const destination = join(capturedRoot, path);
      await io.mkdir(dirname(destination));
      const before = await io.lstat(source);
      manifest.entries.push(before.isSymbolicLink()
        ? await freezeSourceLink(io, root, source, destination, path, before)
        : await freezeSourceFile(io, source, destination, path, before));
    }
    await spelling.recheck();
    const identity = identifySourceManifest(manifest);
    const manifestPath = join(directory, "manifest.json");
    await io.writeManifest(manifestPath, identity.encoding);
    return { root: capturedRoot, manifestPath, manifest: identity.manifest, digest: identity.digest, codePaths, remove };
  } catch (cause) {
    await remove();
    throw sourceCaptureFailure(cause);
  }
}
