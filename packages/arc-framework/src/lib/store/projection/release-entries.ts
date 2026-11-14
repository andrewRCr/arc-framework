/** Index entries release cannot finish once persist settles what it can, answered alike by release and its removal check. */
import { join } from "node:path";
import type { Remedy } from "../refusal.js";
import type { ProjectionIndex } from "./index-schema.js";
import { readStat } from "./change-detection.js";
import { readProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";
import { releasesAbsentWithheld } from "./withheld.js";
import { retriesIndexedEntry } from "./engine-files.js";
import type { ProjectionRemovalGuard } from "./removal-observations.js";
import type { ProjectionRemovalCheck } from "./removal-verdict.js";

/** The target's write authority as persist's ignore check decided it, and the verb its walk ran under. */
export interface ReleaseEntryBasis {
  readonly checkout: string;
  readonly verb: string | undefined;
  readonly writable: (path: string) => boolean;
  /** The refusing ignore rules' remedy, present whenever the guard refused. */
  readonly ignoreRefusal: Remedy | undefined;
}

/** What release answers for an entry it cannot finish, naming the save that settles it. */
export function unfinishedReleaseRemedy(checkout: string, path: string): Remedy {
  return { text: `Projection removal did not finish ${path}. Run arc save from ${checkout}, then retry release.` };
}

/**
 * Release refuses an entry whose file is gone that persist leaves in place: a withheld one its root's ignore rules or an
 * arrival keep held, or an ownerless one its walk never retries. A minted stub keeps adoption's own answer.
 */
export function retainedReleaseEntry(basis: ReleaseEntryBasis, path: string, entry: ProjectionIndex["entries"][string]): Remedy | undefined {
  if (entry.withheld === true) {
    if (releasesAbsentWithheld(basis.writable, path, entry)) return undefined;
    if (!basis.writable(path) && basis.ignoreRefusal !== undefined) return basis.ignoreRefusal;
    return entry.kind === "record" ? entry.refused?.remedy ?? { text: `Run arc save from ${basis.checkout} to finish ${path}, then retry release.` }
      : unfinishedReleaseRemedy(basis.checkout, path);
  }
  return entry.kind === "ownerless" && entry.minted === undefined && !retriesIndexedEntry(basis.verb, path, entry)
    ? unfinishedReleaseRemedy(basis.checkout, path) : undefined;
}

/** The first entry release would refuse whose file is gone, outside any linked ancestor. */
export async function findRetainedReleaseEntry(index: ProjectionIndex, checkout: string, linkFs: ProjectionLinkFs | undefined,
  remedyFor: (path: string, entry: ProjectionIndex["entries"][string]) => Promise<ProjectionRemovalCheck>): Promise<ProjectionRemovalCheck> {
  const candidates = Object.keys(index.entries).filter(path => {
    const entry = index.entries[path];
    return entry?.withheld === true || entry?.kind === "ownerless" && entry.minted === undefined;
  });
  const boundary = await readProjectionLinkBoundary(checkout, candidates, linkFs);
  for (const path of candidates) {
    const entry = index.entries[path];
    if (entry === undefined || boundary(path) !== null || await readStat(join(checkout, path)) !== null) continue;
    const checked = await remedyFor(path, entry);
    if (checked.kind !== "passes") return checked;
  }
  return { kind: "passes" };
}

/** The removal check's prediction of release's answer, reading write authority through the check's one ignore guard. */
export function checkRetainedReleaseEntries(input: { readonly index: ProjectionIndex; readonly checkout: string;
  readonly verb: string | undefined; readonly linkFs?: ProjectionLinkFs; readonly guard: ProjectionRemovalGuard }): Promise<ProjectionRemovalCheck> {
  return findRetainedReleaseEntry(input.index, input.checkout, input.linkFs, async (path, entry) => {
    // Only a withheld entry's answer turns on write authority.
    const guarded: ProjectionRemovalCheck = entry.withheld === true ? await input.guard(path) : { kind: "passes" };
    if (guarded.kind === "unobservable") return guarded;
    const remedy = retainedReleaseEntry({ checkout: input.checkout, verb: input.verb, writable: () => guarded.kind === "passes",
      ignoreRefusal: guarded.kind === "would-refuse" ? guarded.remedy : undefined }, path, entry);
    return remedy === undefined ? { kind: "passes" } : { kind: "would-refuse", remedy };
  });
}
