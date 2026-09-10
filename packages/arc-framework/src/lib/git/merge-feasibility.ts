/** Exact-coordinate Git merge feasibility, independent of host admission. */

import { z } from "zod";

import type { RawGitExec } from "../change-facts.js";
import type { PathTreatmentClassifier } from "./base-drift-types.js";
import { isGitObjectId } from "./object-id.js";
import { readMergeTreeComposition } from "./merge-tree.js";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const GitMergeFeasibilityCoordinatesSchema = z.strictObject({
  base: ObjectIdSchema,
  head: ObjectIdSchema,
});
type GitMergeFeasibilityCoordinates = z.infer<typeof GitMergeFeasibilityCoordinatesSchema>;

export const GitMergeFeasibilitySchema = z.discriminatedUnion("state", [
  GitMergeFeasibilityCoordinatesSchema.extend({ state: z.literal("clean") }),
  GitMergeFeasibilityCoordinatesSchema.extend({
    state: z.literal("regenerable-conflict"),
    paths: z.array(z.string().min(1)).min(1),
  }),
  GitMergeFeasibilityCoordinatesSchema.extend({
    state: z.literal("substantive-conflict"),
    paths: z.array(z.string().min(1)).min(1),
  }),
  GitMergeFeasibilityCoordinatesSchema.extend({
    state: z.literal("unavailable"),
    detail: z.string().min(1),
  }),
]);
export type GitMergeFeasibility = z.infer<typeof GitMergeFeasibilitySchema>;

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
