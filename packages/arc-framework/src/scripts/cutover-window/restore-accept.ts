/** Exact ref values explicitly accepted for a restore. */
import { WindowRefusal } from "./result.js";
import { isGitObjectId } from "../../lib/git/object-id.js";
import { WINDOW_DECISION_REF_PATTERN } from "./restore-decision-document.js";
/** An Owner-named ref value; null denotes an accepted absence. */
export interface WindowAcceptedValue { ref: string; value: string | null }

/** Parse repeatable ref=value operands as exact pairs. */
export function parseWindowAcceptedValues(values: readonly string[]): WindowAcceptedValue[] {
  const accepted: WindowAcceptedValue[] = [];
  for (const raw of values) {
    const separator = raw.lastIndexOf("="), ref = raw.slice(0, separator), value = raw.slice(separator + 1);
    if (separator < 1 || !WINDOW_DECISION_REF_PATTERN.test(ref) || value !== "absent" && !isGitObjectId(value)) {
      throw new WindowRefusal([{ subject: "restore acceptance", condition: `Invalid ref=value operand: ${raw}`,
        remedy: "Name a refs/arc/ ref and its full observed object ID or absent with --accept, then retry restore." }]);
    }
    const next = value === "absent" ? null : value;
    if (!accepted.some(item => item.ref === ref && item.value === next)) accepted.push({ ref, value: next });
  }
  return accepted;
}
