/** Share raw checkout topology and marker generations without weakening each consumer's validation. */
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees, type RegisteredWorktreeScanResult } from "../git/worktree-roster.js";
import { readWorktreeMarkerGeneration, type WorktreeMarkerGenerationReadResult } from "../git/worktree-marker.js";

/** One lazy topology observation and the raw marker generation observed at each registered path. */
export interface CheckoutObservation {
  readonly scan: () => Promise<RegisteredWorktreeScanResult>;
  readonly readMarker: (checkout: string) => Promise<WorktreeMarkerGenerationReadResult>;
}

/** Retain observations, including failures, for one rendering round; new rounds observe again. */
export function createCheckoutObservation(exec: GitExec,
  readMarker: CheckoutObservation["readMarker"] = readWorktreeMarkerGeneration): CheckoutObservation {
  let scan: Promise<RegisteredWorktreeScanResult> | undefined;
  const markers = new Map<string, Promise<WorktreeMarkerGenerationReadResult>>();
  return { scan: () => scan ??= scanRegisteredWorktrees(exec), readMarker: checkout => {
    let read = markers.get(checkout);
    if (read === undefined) { read = readMarker(checkout); markers.set(checkout, read); }
    return read;
  } };
}
