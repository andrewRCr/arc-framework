/** Freeze selected source using caller-side execution presentation. */
import type { ResolvedCheckRequest } from "../resolve-request.js";
import type { SourceBoundary, SourceBoundaryIO } from "./source-boundary.js";
import type { SourcePresentationIO } from "./source-io.js";
import { freezeSourcePresentation, type FrozenSourcePresentation } from "./source-presentation.js";
import { join, sep } from "node:path";
import { SourceCaptureError, sourceCaptureFailure } from "./source-error.js";
import { verifySelectedSourcePresentation } from "./source-selected.js";

/** Caller-side Git and filesystem operations for selected materialization. */
export interface SourceMaterializationIO extends SourceBoundaryIO { source: SourcePresentationIO }

/** Materialize the selected code basis on the caller and freeze its resulting presentation. */
export async function freezeSelectedSource(io: SourceMaterializationIO, root: string,
  request: ResolvedCheckRequest, boundary: SourceBoundary): Promise<FrozenSourcePresentation> {
  let directory: string | undefined;
  let frozen: FrozenSourcePresentation | undefined;
  try {
    await boundary.recheck();
    let presentation = root;
    if (request.source.kind !== "worktree") {
      directory = await io.source.files.createDirectory();
      presentation = join(directory, "selected");
      await io.source.mkdir(presentation);
      const options = { cwd: root, indexFile: join(directory, "index"), objectAccess: "local-only" as const };
      try {
        await io.git("git", ["read-tree", boundary.coordinates.tree], options);
        await io.git("git", [`--attr-source=${boundary.coordinates.tree}`, "checkout-index", "--all",
          "--ignore-skip-worktree-bits", `--prefix=${presentation}${sep}`], options);
      } catch (cause) {
        throw new SourceCaptureError("Selected source checkout could not establish caller-side filters, required tools or local objects", { cause });
      }
    }
    frozen = await freezeSourcePresentation(presentation, boundary.pathListing, boundary.coordinates, io.source);
    if (request.source.kind !== "worktree") await verifySelectedSourcePresentation(io, root, frozen);
    await boundary.recheck();
    if (directory !== undefined) await io.source.files.removeDirectory(directory);
    return frozen;
  } catch (cause) {
    await Promise.allSettled([frozen?.remove(), directory === undefined ? undefined : io.source.files.removeDirectory(directory)]);
    throw sourceCaptureFailure(cause);
  }
}
