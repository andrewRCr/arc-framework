/** Preserve typed store refusal details while naming the command that can repair missing history. */
import type { StoreRefusal } from "../refusal.js";
import type { RefusedMark } from "./index-schema.js";

/** Present a refusal without allowing an ordinary command to wait on the network. */
export function markStoreRefusal(refusal: StoreRefusal, verb?: "save" | "write-back"): RefusedMark {
  const remedy = verb === "write-back" && refusal.code === "state-unresolvable" && refusal.historyRefs.length > 0
    ? { text: `Run arc save to pull the named history and retry this edit. ${refusal.remedy.text}`, argv: ["arc", "save"] }
    : refusal.remedy;
  return { reason: refusal.code === "record-malformed" ? `${refusal.rule}: ${refusal.condition}` : refusal.condition,
    remedy };
}
