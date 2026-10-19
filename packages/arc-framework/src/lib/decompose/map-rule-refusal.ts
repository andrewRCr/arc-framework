/** Consistent authored-map loci and repair text for pure decomposition rules. */
import type { DecomposeRefusal } from "./refusal.js";

/** Describe an authored decision that must change before the selected mode can continue. */
export function decomposeMapRuleRefusal(reason: Exclude<DecomposeRefusal["reason"], "store">,
  locus: string, repair: string): DecomposeRefusal {
  return { status: "refused", reason, class: "recoverable", locus, remedy: { text: repair } };
}
