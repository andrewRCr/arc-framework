/** Object-fault facts retained by captures until a caller assembles its public result. */

import type { ListingDiagnostic } from "../read.js";

/** Captured object facts share the fault mapper's state rows. */
export type RefCaptureFault = "missing" | "unparseable" | "no-metadata" | "misplaced";

/** Diagnostics outside object-fault classification retain their own policy without a fault tag. */
export type CapturedRefDiagnostic = ListingDiagnostic & { fault?: RefCaptureFault };

/** Remove capture-only facts when a listing exposes its diagnostics. */
export function publicRefDiagnostic(diagnostic: CapturedRefDiagnostic): ListingDiagnostic {
  const result = { ...diagnostic };
  delete result.fault;
  return result;
}
