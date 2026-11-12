/** Recovery route shared by designation and physical layout checks. */
import type { Remedy } from "../refusal.js";

/** Finish a recorded switch or reconcile an intentional designation change. */
export function layoutRecoveryRemedy(): Remedy {
  return { text: "Run arc store migrate to finish the recorded move or align the layout; undo an unintended remote edit before retrying instead.",
    argv: ["arc", "store", "migrate"] };
}
