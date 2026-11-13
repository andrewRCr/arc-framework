/** Exact ref values explicitly accepted for a restore. */
import { WindowRefusal } from "./result.js";
/** An Owner-named ref value; null denotes an accepted absence. */
export interface WindowAcceptedValue { ref: string; value: string | null }

/** Parse repeatable ref=value operands as exact pairs. */
export function parseWindowAcceptedValues(values: readonly string[]): WindowAcceptedValue[] {
  const accepted: WindowAcceptedValue[] = [];
  for (const raw of values) {
    const separator = raw.lastIndexOf("="), ref = raw.slice(0, separator), value = raw.slice(separator + 1);
    if (separator < 1 || !/^refs\/arc\/[^\s\0]+$/u.test(ref) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64}|absent)$/u.test(value)) {
      throw new WindowRefusal([{ subject: "restore acceptance", condition: `Invalid ref=value operand: ${raw}`,
        remedy: "Name a refs/arc/ ref and its full observed object ID or absent with --accept, then retry restore." }]);
    }
    const next = value === "absent" ? null : value;
    if (!accepted.some(item => item.ref === ref && item.value === next)) accepted.push({ ref, value: next });
  }
  return accepted;
}
