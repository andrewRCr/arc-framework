/** Registered checkout classification using ARC's marker and husk trust decoders. */
import { scanRegisteredWorktrees, type RegisteredWorktree } from "../../lib/git/worktree-roster.js";
import { decodeWorktreeMarkerOwnership, decodeWorktreeHuskStamp, readWorktreeMarker,
  type WorktreeMarkerReadResult, type DecodedWorktreeMarkerOwnership, type DecodedWorktreeHuskStamp } from "../../lib/git/worktree-marker.js";
import type { WindowGitReadIO } from "./git.js";
import { WindowRefusal } from "./result.js";

/** The distinct checkout states the window reports before deciding its checkout conditions. */
export type WindowCheckoutKind = "primary" | "marked" | "no-marker" | "branch-subject" | "partial-errand"
  | "manual-only" | "pending" | "malformed-marker" | "missing-folder" | "husk";
/** One physical registration with its marker evidence retained for later decisions. */
export interface WindowCheckout extends RegisteredWorktree {
  kind: WindowCheckoutKind; marker: WorktreeMarkerReadResult;
  ownership?: DecodedWorktreeMarkerOwnership; husk?: DecodedWorktreeHuskStamp;
}

/** Classify a registered checkout without inferring ownership from its branch or creation provenance. */
export function classifyWindowCheckout(row: RegisteredWorktree, marker: WorktreeMarkerReadResult): WindowCheckout {
  const checkout = { ...row, marker };
  if (!row.folderPresent) return { ...checkout, kind: "missing-folder" };
  if (marker.kind === "malformed") return { ...checkout, kind: "malformed-marker" };
  if (marker.kind === "present" && marker.marker.husk !== undefined) {
    return { ...checkout, kind: "husk", husk: decodeWorktreeHuskStamp(marker.marker.husk) };
  }
  if (row.primary) return { ...checkout, kind: "primary" };
  if (marker.kind === "absent") return { ...checkout, kind: "no-marker" };
  const ownership = decodeWorktreeMarkerOwnership(marker.marker);
  if (ownership.kind === "manual-only") return { ...checkout, kind: "manual-only", ownership };
  if (ownership.subject.kind === "branch") return { ...checkout, kind: "branch-subject", ownership };
  if (ownership.subject.kind === "partial-errand") return { ...checkout, kind: "partial-errand", ownership };
  if (ownership.subject.kind === "work-unit") return { ...checkout, kind: "marked", ownership };
  return { ...checkout, kind: ownership.provisioning === "ready" ? "marked" : "pending", ownership };
}

/** Read every registered checkout and its physical marker without creating or repairing ownership. */
export async function readWindowCheckouts(io: WindowGitReadIO): Promise<WindowCheckout[]> {
  const scan = await scanRegisteredWorktrees((command, args, options) =>
    io.exec(command, args, { ...options, cwd: io.repo, objectAccess: "local-only" }));
  if (!scan.ok) throw new WindowRefusal([{ subject: "checkout registrations", condition: scan.message,
    remedy: "Repair the unreadable Git worktree registration or restore Git access, then retry." }]);
  return Promise.all(scan.worktrees.map(async row => {
    const marker: WorktreeMarkerReadResult = row.folderPresent ? await readWorktreeMarker(row.path) : { kind: "absent" };
    return classifyWindowCheckout(row, marker);
  }));
}
