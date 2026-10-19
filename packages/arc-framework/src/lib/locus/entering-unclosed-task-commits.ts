/** Attach close evidence to the selected entering work unit without reading other checkouts. */
import type { DerivedLocusFrame } from "./derived-reader.js";
import { computeUnclosedTaskCommits, type ComputeUnclosedTaskCommitsInput } from "./unclosed-task-commits.js";
/** Preserve role authority when the advisory computation is absent or fails. */
export async function withEnteringUnclosedTaskCommits(frame: DerivedLocusFrame,
  input: Omit<ComputeUnclosedTaskCommitsInput, "slug">): Promise<DerivedLocusFrame> {
  if (!input.store?.capabilities.stateOffBranch || frame.active === null) return frame;
  const active = frame.active;
  let evidence;
  try { evidence = await computeUnclosedTaskCommits({ ...input, slug: active.subject.key }); }
  catch (error) {
    evidence = { status: "refused" as const, code: "observation-failed", reason: error instanceof Error ? error.message : String(error),
      remedy: { text: "Repair the reported commit observation, then run session status again." },
      actions: [{ text: "Repair the reported commit observation, then run session status again.", checkout: input.cwd }] };
  }
  if (evidence === null) return frame;
  const context = { ...active.context, unclosedTaskCommits: evidence };
  const entering = frame.entering.kind === "selected" && frame.entering.row.checkout.path === active.checkoutPath
    ? { ...frame.entering, row: { ...frame.entering.row, context } } : frame.entering;
  return { ...frame, active: { ...active, context }, entering,
    roster: frame.roster.map(row => row.checkout.path === active.checkoutPath ? { ...row, context } : row) };
}
