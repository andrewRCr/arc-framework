/** Resolve ambiguous path-query absence against the immutable containing tree. */

import { readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";

/** Present objects need no tree read; missing answers retain the tree evidence for caller policy. */
export type RefPointObject = { kind: "present"; object: BatchObject }
  | { kind: "absent"; entries: readonly RefTreeEntry[] }
  | { kind: "missing"; entries: readonly RefTreeEntry[] | undefined };

/** A null tree is known unavailable; an omitted tree has not yet been acquired. */
export interface RefPointPath { ref: string; tip: string; path: string; entries?: readonly RefTreeEntry[] | null }

/** Distinguish an absent path from a missing object without rereading a present answer. */
export async function resolveRefPointObject(context: RefBackendContext, path: RefPointPath,
  object: BatchObject | null | undefined): Promise<RefPointObject> {
  if (object) return { kind: "present", object };
  const entries = path.entries === undefined
    ? (await readRefTrees(context, new Map([[path.ref, path.tip]]))).get(path.ref) : path.entries ?? undefined;
  if (!entries || entries.some(entry => entry.path === path.path)) return { kind: "missing", entries };
  return { kind: "absent", entries };
}
