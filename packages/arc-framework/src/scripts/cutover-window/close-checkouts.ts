/** Inspect every registered checkout's immutable HEAD tree before releasing the window hold. */
import type { WindowHoldIO } from "./hold.js";
import { readWindowCheckouts } from "./checkouts.js";
import { readWindowTrackedPaths } from "./branch-observations.js";
import type { WindowFinding } from "./result.js";

/** A checkout's on-disk status cannot substitute for removing state from its committed HEAD tree. */
export async function readWindowCloseCheckoutFindings(io: WindowHoldIO): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const checkout of await readWindowCheckouts(io)) {
    const paths = await readWindowTrackedPaths(io, checkout.head);
    if (paths.length) findings.push({ subject: checkout.path,
      condition: `HEAD ${checkout.head} still tracks state paths: ${JSON.stringify(paths)}.`,
      remedy: "Finish this checkout's merge and tracked-state removal, then retry close." });
  }
  return findings;
}
