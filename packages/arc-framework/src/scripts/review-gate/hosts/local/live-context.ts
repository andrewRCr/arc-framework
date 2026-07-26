/** Live ARC vehicle and work-unit metadata resolution for local review. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { GitExec } from "../../../../lib/git/exec.js";
import {
  readActiveMetaCandidates,
  parseMetaRecord,
  toMetaRecord,
  type MetaRecord,
} from "../../../../lib/active/meta-reader.js";
import { readErrandSlugByBranch } from "../../../../lib/errand/record.js";
import { readConfiguredIdentity } from "../../../../lib/git/identity.js";
import type { LocalReviewLiveContext } from "./review-authority.js";

export interface ResolvedLocalReviewLiveContext {
  context: LocalReviewLiveContext;
  meta: MetaRecord | null;
}

/** Resolve the current branch to exactly one WU meta or Errand identity record. */
export async function readLocalReviewLiveContext(input: {
  exec: GitExec;
  cwd: string;
}): Promise<ResolvedLocalReviewLiveContext> {
  const activeIdentity = await readConfiguredIdentity(input.exec);
  const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: input.cwd,
  })).stdout.trim();
  const active = await readActiveMetaCandidates(input.cwd);
  const matching = active.candidates.filter((candidate) => candidate.branch === branch);
  if (matching.length > 1) throw new Error("multiple active work units match the current branch");
  if (matching.length === 1) {
    const candidate = matching[0];
    if (candidate === undefined) throw new Error("active work unit disappeared");
    const meta = toMetaRecord(parseMetaRecord(await readFile(join(input.cwd, candidate.path), "utf8")));
    if (meta === null) throw new Error("active work-unit metadata is incomplete");
    const identity = candidate.filename.replace(/^meta-/u, "").replace(/\.md$/u, "");
    return {
      context: {
        activeIdentity,
        workUnit: {
          identity,
          owner: meta.owner,
        },
        errand: null,
      },
      meta,
    };
  }
  const errands = await readErrandSlugByBranch({ exec: input.exec, identity: activeIdentity });
  return {
    context: {
      activeIdentity,
      workUnit: null,
      errand: errands.has(branch) ? { identity: errands.get(branch) ?? "" } : null,
    },
    meta: null,
  };
}
