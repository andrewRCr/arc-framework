/** Present record-based edit decisions at the engine's persistence boundary. */
import type { Store } from "../contract.js";
import type { Slug } from "../../kernel/index.js";
import type { ProjectionRights } from "./process-state.js";
import { readProjectionEditRights, type ProjectionEditRights } from "./rights.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInResult } from "./take-in-port.js";

/** Bind the store and editing identity while taking the file-holding checkout from each request. */
export function bindProjectionRights(store: Store, identity: Slug): ProjectionRights {
  return async request => {
    const read = await readProjectionEditRights({ store, identity, reference: request.entry.reference, checkout: request.checkout });
    if (read.status === "refused") return { reason: read.refusal.condition, remedy: read.refusal.remedy };
    return read.result.kind === "editable" ? null : protectedMark(read.result);
  };
}

/** Keep an unsent hold's resolution token while the caller reports the current rights denial separately. */
export function refuseProjectionEdit(entry: RecordEntry, denial: RefusedMark): TakeInResult {
  const mark = entry.refused?.reason === "bases-disagree" ? entry.refused : denial;
  return { answer: "refused", mark, entry: { ...entry, pending: true, refused: mark } };
}

function protectedMark(rights: Extract<ProjectionEditRights, { kind: "protected" }>): RefusedMark {
  const subject = rights.reference.owner.name;
  if (rights.reason === "identity") return {
    reason: `This record belongs to ${rights.owner}; the current identity may not edit it.`,
    remedy: { text: `Have ${rights.owner} apply the edit under their identity, then retry.` },
  };
  if (rights.reason === "checkout") return {
    reason: `The ${rights.reference.kind} for ${subject} is editable only from its owning checkout.`,
    remedy: { text: `Apply the edit in the checkout whose marker claims ${subject}, then save again.` },
  };
  return { reason: `The ${rights.reference.kind} for ${subject} is not editable by hand in its current lifecycle state.`,
    remedy: { text: "Use the record's owning verb, or repair its lifecycle metadata before retrying the edit." } };
}
