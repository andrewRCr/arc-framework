/** Present record-based edit decisions at the engine's persistence boundary. */
import type { Store } from "../contract.js";
import type { Slug } from "../../kernel/index.js";
import type { ProjectionRights } from "./process-state.js";
import { readProjectionProtection } from "./protection.js";
import type { GitExec } from "../../git/exec.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInResult } from "./take-in-port.js";

/** Bind the store and editing identity while taking the file-holding checkout from each request. */
export function bindProjectionRights(store: Store, identity: Slug, exec: GitExec): ProjectionRights {
  return request => readProjectionProtection({ store, identity, exec, checkout: request.checkout }, request.entry.reference);
}

/** Keep an unsent hold's resolution token while the caller reports the current rights denial separately. */
export function refuseProjectionEdit(entry: RecordEntry, denial: RefusedMark): TakeInResult {
  const mark = entry.refused?.reason === "bases-disagree" ? entry.refused : denial;
  return { answer: "refused", mark, entry: { ...entry, pending: true, refused: mark } };
}
