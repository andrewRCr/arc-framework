/** Durable archive work uses slash-separated checkout paths, never a lexical filename prefix alone. */
import type { ProjectionIndex } from "./index-schema.js";

/** Test a scope by path components, including the scope itself. */
export function coversArchivePath(scope: string, path: string): boolean {
  return path === scope || path.startsWith(`${scope}/`);
}

/** A state version can advance only when both archive namespaces have been accounted for. */
export function hasOutstandingArchiveWork(index: ProjectionIndex): boolean {
  return (index.archiveDiscoveryPending?.length ?? 0) > 0
    || (index.archiveRecoveryCopies?.length ?? 0) > 0 || (index.archiveCopyPending?.length ?? 0) > 0;
}
