/** Exact-coordinate Git merge feasibility, independent of host admission. */

import type { RawGitExec } from "../change-facts.js";
import type { PathTreatmentClassifier } from "./base-drift-types.js";
import { isGitObjectId } from "./object-id.js";
import { readMergeTreeComposition } from "./merge-tree.js";

interface GitMergeFeasibilityCoordinates {
  base: string;
  head: string;
}

export type GitMergeFeasibility = GitMergeFeasibilityCoordinates & (
  | { state: "clean" }
  | { state: "regenerable-conflict" | "substantive-conflict"; paths: string[] }
  | { state: "unavailable"; detail: string }
);

export interface ObserveGitMergeFeasibilityOptions extends GitMergeFeasibilityCoordinates {
  exec: RawGitExec;
  classify: PathTreatmentClassifier;
}

/** Observe index-free merge feasibility for one exact base/head pair. */
export async function observeGitMergeFeasibility(
  options: ObserveGitMergeFeasibilityOptions,
): Promise<GitMergeFeasibility> {
  const coordinates = { base: options.base, head: options.head };
  if (!isGitObjectId(options.base) || !isGitObjectId(options.head)) {
    return { state: "unavailable", ...coordinates, detail: "Base and head must be exact Git object IDs." };
  }
  const composition = await readMergeTreeComposition({
    exec: options.exec,
    left: options.base,
    right: options.head,
  });
  if (composition.state === "unavailable") {
    return { state: "unavailable", ...coordinates, detail: composition.detail };
  }
  if (composition.state === "clean") return { state: "clean", ...coordinates };
  try {
    const regenerable = composition.paths.every((path) => options.classify(path) === "regenerable");
    return {
      state: regenerable ? "regenerable-conflict" : "substantive-conflict",
      ...coordinates,
      paths: composition.paths,
    };
  } catch {
    return {
      state: "unavailable",
      ...coordinates,
      detail: "Conflict path treatment could not be established.",
    };
  }
}
