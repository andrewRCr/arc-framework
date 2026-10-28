/** Verify the fixed source descriptor and its captured presentation before execution. */
import { PrepareParamsSchema, type PrepareParams } from "./contract-operations.js";
import { SourceManifestSchema, type SourceCoordinates, type SourceManifest } from "./contract-source.js";
import { nodeSourcePresentationIO, type SourcePresentationIO } from "./source-io.js";
import { join, resolve } from "node:path";
import { createSourceSpellingIndex } from "./source-spelling.js";
import { verifySourceFile } from "./source-file.js";
import { verifySourceLink } from "./source-link.js";
import { SourceCaptureError, sourceCaptureFailure, sourceEntry } from "./source-error.js";
import { decodeSourceText, sourcePathContains } from "./source-paths.js";
import { identifySourceManifest } from "./source-manifest.js";

function parseManifest(text: string): SourceManifest {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new SourceCaptureError("Source manifest JSON is invalid"); }
  const parsed = SourceManifestSchema.safeParse(value);
  if (!parsed.success) throw new SourceCaptureError("Source manifest is invalid");
  return parsed.data;
}

function sameCoordinates(expected: SourceCoordinates, actual: SourceCoordinates): boolean {
  return expected.tree === actual.tree && expected.head === actual.head && expected.base === actual.base
    && expected.merged.length === actual.merged.length && expected.merged.every((value, index) => value === actual.merged[index]);
}

function confirmIdentity(source: PrepareParams["source"], manifest: SourceManifest, text: string): void {
  const identity = identifySourceManifest(manifest);
  if (identity.encoding !== text) throw new SourceCaptureError("Source manifest encoding is not canonical");
  if (identity.digest !== source.digest) throw new SourceCaptureError("Source manifest digest no longer matches the requested identity");
  if (!sameCoordinates(source.coordinates, manifest.coordinates)) throw new SourceCaptureError("Source coordinates no longer match the requested coordinates");
}

async function confirmDescriptorLocation(source: PrepareParams["source"], io: SourcePresentationIO): Promise<void> {
  const [root, manifest] = await Promise.all([io.realpath(source.root), io.realpath(source.manifest)]);
  if (sourcePathContains(resolve(source.root), resolve(source.manifest)) || sourcePathContains(root, manifest)) {
    throw new SourceCaptureError("Source manifest descriptor must remain outside project source paths");
  }
}

/** Verify manifest identity and every captured file or link without changing the source artifact. */
export async function verifySourcePresentation(source: PrepareParams["source"],
  io: SourcePresentationIO = nodeSourcePresentationIO): Promise<SourceManifest> {
  try {
    const descriptor = PrepareParamsSchema.shape.source.safeParse(source);
    if (!descriptor.success) throw new SourceCaptureError("Source descriptor is invalid");
    await confirmDescriptorLocation(descriptor.data, io);
    const text = decodeSourceText(await io.readManifest(source.manifest));
    const manifest = parseManifest(text);
    confirmIdentity(descriptor.data, manifest, text);
    const spelling = createSourceSpellingIndex(io, source.root);
    for (const entry of manifest.entries) {
      if (await sourceEntry("verify", () => spelling.resolve(entry.path)) !== entry.path) {
        throw new SourceCaptureError("Source path spelling no longer matches the manifest");
      }
      const path = join(source.root, entry.path);
      await sourceEntry("verify", () => entry.kind === "file"
        ? verifySourceFile(io, path, entry) : verifySourceLink(io, source.root, path, entry));
    }
    await sourceEntry("verify", () => spelling.recheck());
    return manifest;
  } catch (cause) { throw sourceCaptureFailure(cause, "verify"); }
}
