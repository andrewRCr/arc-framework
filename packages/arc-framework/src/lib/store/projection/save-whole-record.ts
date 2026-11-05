/** Keep removal and verb-owned alternatives on their originating verb's resolution path. */
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { WholeRecordConflict } from "../conflict.js";
import type { RefusedMark } from "./index-schema.js";
import type { WriteBackContext } from "./write-back.js";
import type { TakeInRequest } from "./take-in-port.js";
import { checkWriteBackEdit } from "./check-edit.js";

/** A content-only save cannot choose absence, placement, or fields the hand-edit check reserves. */
export async function wholeRecordResolutionRefusal(context: WriteBackContext, request: TakeInRequest,
  conflict: WholeRecordConflict): Promise<RefusedMark | null> {
  const { current, incoming } = conflict;
  if (current.value === null || incoming.value === null) return owningVerbRefusal(context, conflict, "removal");
  if (canonicalize(current.value.placement ?? null) !== canonicalize(incoming.value.placement ?? null)) {
    return owningVerbRefusal(context, conflict, "changed placement");
  }
  if (canonicalize(current.value.links ?? null) !== canonicalize(incoming.value.links ?? null)) {
    return owningVerbRefusal(context, conflict, "verb-owned traceability fields");
  }
  const checked = await checkWriteBackEdit({ context, request, base: { kind: "stored", version: current.value.version },
    content: incoming.value.content });
  if (checked.status === "refused") return { reason: checked.refusal.condition, remedy: checked.refusal.remedy };
  const rule = checked.result[0];
  return rule === undefined ? null : { reason: `The whole-record alternative requires a verb-owned change: ${rule.reason}`,
    remedy: rule.remedy };
}

async function owningVerbRefusal(context: WriteBackContext, conflict: WholeRecordConflict, change: string): Promise<RefusedMark> {
  const history = await context.store.history({ reference: conflict.record });
  if (history.status === "refused") return { reason: history.refusal.condition, remedy: history.refusal.remedy };
  const incoming = conflict.incoming.value;
  const event = history.result.find(each => incoming === null ? each.content === null : each.version === incoming.version);
  const provenance = event?.provenance;
  const verb = provenance !== undefined && "verb" in provenance ? `arc ${provenance.verb}` : "the verb that made the alternative";
  return { reason: `The whole-record conflict includes ${change}, which content-only save cannot resolve.`,
    remedy: { text: `Redo the change through ${verb} for ${conflict.record.owner.name}, then retry the remaining save.` } };
}
