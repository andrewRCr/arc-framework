/** Acquire and recheck the caller-side source coordinates and enumerated paths. */
import type { GitExec, RawGitExec } from "../../git/exec.js";
import type { CheckSourceSelection, ResolvedCheckRequest } from "../resolve-request.js";
import type { SourceCoordinates } from "./contract-source.js";
import { createWorktreeSnapshot, stagedIndexTree, type WorktreeSnapshot } from "../tree.js";
import { readCheckHead } from "../head.js";
import { requireSourceCoordinates } from "./source-selection.js";

/** Git operations needed to acquire a selected source boundary. */
export interface SourceBoundaryIO { git: GitExec; gitRaw: RawGitExec }
/** Owned coordinate guard; raw path bytes remain separate from file presentation evidence. */
export interface SourceBoundary {
  readonly coordinates: SourceCoordinates;
  readonly pathListing: Uint8Array;
  recheck(): Promise<void>;
  remove(): Promise<void>;
}

/** Acquire the selected code coordinates and retain any private index through capture. */
export async function acquireSourceBoundary(io: SourceBoundaryIO, root: string,
  request: ResolvedCheckRequest): Promise<SourceBoundary> {
  const coordinates = requireSourceCoordinates(request);
  const source = { ...request.source, head: { ...request.source.head } };
  let snapshot: WorktreeSnapshot | undefined;
  let active = true;
  const remove = async () => { await snapshot?.remove(); active = false; };
  try {
    snapshot = source.kind === "worktree" ? await createWorktreeSnapshot(io.git, root) : undefined;
    const listing = await readListing(io, root, coordinates.tree);
    const recheck = async () => {
      try {
        if (!active) throw new Error("Source boundary has been released");
        await assertSelectedCoordinates(io, root, source, coordinates, snapshot);
        if (!Buffer.from(listing).equals(Buffer.from(await readListing(io, root, coordinates.tree)))) {
          throw new Error("Source path enumeration changed");
        }
      } catch (cause) {
        await remove();
        throw captureChanged(cause);
      }
    };
    await recheck();
    return { get coordinates() { return { ...coordinates, merged: [...coordinates.merged] }; },
      get pathListing() { return Uint8Array.from(listing); }, recheck, remove };
  } catch (cause) {
    await remove();
    throw captureChanged(cause);
  }
}

async function readListing(io: SourceBoundaryIO, root: string, tree: string): Promise<Uint8Array> {
  return (await io.gitRaw(["ls-tree", "-r", "--name-only", "-z", tree], { cwd: root, objectAccess: "local-only" })).stdout;
}

async function assertSelectedCoordinates(io: SourceBoundaryIO, root: string, source: CheckSourceSelection,
  coordinates: SourceCoordinates, snapshot: WorktreeSnapshot | undefined): Promise<void> {
  const head = await readCheckHead(io.git, root, source.kind === "commit" ? source.commit : "HEAD");
  if (head.status !== source.head.status || (head.status === "known"
    && (source.head.status !== "known" || head.commit !== source.head.commit))) throw new Error("Source HEAD evidence changed");
  let tree: string;
  if (source.kind === "worktree" && snapshot !== undefined) tree = await snapshot.refresh();
  else if (source.kind === "index") tree = await stagedIndexTree(io.git, root, source.indexFile);
  else if (source.kind === "commit") {
    tree = (await io.git("git", ["rev-parse", "--verify", `${source.commit}^{tree}`], { cwd: root, objectAccess: "local-only" })).stdout.trim();
  } else throw new Error("Source worktree index is unavailable");
  if (tree !== coordinates.tree) throw new Error("Selected source tree changed");
}

function captureChanged(cause: unknown): Error {
  return new Error("Source paths or code coordinates changed or became unavailable during capture. Repair the checkout if needed and retry; keep the check local if a stable source cannot be captured.", { cause });
}
