/** Checkout admission from registration ownership and the production lifecycle roster. */
import type { WindowCheckout } from "./checkouts.js";
import type { WindowFinding } from "./result.js";
import type { DerivedCheckoutRow } from "../../lib/locus/derived-roster.js";
import { decodeWorktreeMarkerOwnership, type WorktreeSubject } from "../../lib/git/worktree-marker.js";
import { readStatusCheckoutRoster } from "../../handlers/status/checkout-roster.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import type { WindowGitReadIO } from "./git.js";
import { WindowRefusal } from "./result.js";
import type { WindowTransientRecord } from "./transients.js";
import { TransientIdentityRecordSchema, projectLocusIdentity } from "../../lib/errand/identity-record.js";

/** Refuse an Errand marker unless some acquired identity record holds its exact claim generation. */
export function windowErrandHolderFindings(checkouts: readonly WindowCheckout[], records: readonly WindowTransientRecord[]): WindowFinding[] {
  const identities = records.map(record => projectLocusIdentity(TransientIdentityRecordSchema.parse(JSON.parse(record.content))));
  return checkouts.flatMap(checkout => {
    const ownership = checkout.marker.kind === "present" ? decodeWorktreeMarkerOwnership(checkout.marker.marker) : undefined;
    const subject = ownership?.kind === "current" ? ownership.subject : undefined;
    if (subject?.kind !== "errand") return [];
    if (identities.some(identity => identity.kind === "errand" && identity.purpose === "errand"
      && identity.key === subject.slug && identity.claimId === subject.claimId)) return [];
    const path = JSON.stringify(checkout.path), unlock = checkout.locked === undefined ? "" : `git worktree unlock ${path}, then `;
    return [{ subject: checkout.path, condition: `Errand ${subject.slug} claim ${subject.claimId} has no matching acquired identity record.`,
      remedy: `Restore the exact holder's local or origin identity record, or preserve wanted work and run ${unlock}git worktree remove ${path}, then retry check.` }];
  });
}

/** Read status's production roster at the physical primary as its configured reading identity. */
export async function readWindowEndedCheckoutFindings(io: WindowGitReadIO, checkouts: readonly WindowCheckout[]): Promise<WindowFinding[]> {
  const primary = checkouts.find(row => row.primary);
  if (primary === undefined) throw new WindowRefusal([{ subject: "checkout registrations", condition: "No registered primary checkout was found.",
    remedy: "Repair the primary worktree registration, then retry check." }]);
  const exec: WindowGitReadIO["exec"] = (command, args, options) => io.exec(command, args,
    { ...options, cwd: options?.cwd ?? primary.path, objectAccess: "local-only" });
  const identity = await createDefaultStorePorts({ checkoutRoot: primary.path, exec }).identity();
  if (identity === null) throw new WindowRefusal([{ subject: primary.path, condition: "The status roster has no configured reading identity.",
    remedy: "Set arc.identity or user.name for this repository, then retry check." }]);
  try {
    return windowEndedCheckoutFindings(checkouts, await readStatusCheckoutRoster({ cwd: primary.path, exec }, identity));
  } catch (error) {
    throw new WindowRefusal([{ subject: primary.path, condition: `The status checkout roster could not be read: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "Repair the reported status evidence or Git access, then retry check." }]);
  }
}

/** Explain lifecycle and husk refusals without replacing the production roster's diagnosis. */
export function windowEndedCheckoutFindings(checkouts: readonly WindowCheckout[], roster: readonly DerivedCheckoutRow[]): WindowFinding[] {
  const findings: WindowFinding[] = [];
  for (const row of roster) {
    if (row.kind !== "retired" && row.kind !== "unresolved-checkout") continue;
    const holder = row.subject === null ? "unknown holder" : `${row.subject.kind} ${row.subject.key}`;
    findings.push({ subject: row.checkout.path, condition: `Checkout is ${row.kind}: ${holder}.`,
      remedy: row.kind === "unresolved-checkout"
        ? [...row.diagnostics.map(item => item.message), ...(row.actions ?? []).map(item => item.text),
          "Resolve the reported checkout evidence, then retry check."].join(" ")
        : holderRemedy(row.subject.kind, row.subject.key) });
  }
  for (const checkout of checkouts) {
    if (checkout.marker.kind !== "present" || checkout.marker.marker.husk === undefined) continue;
    const subject = checkout.marker.marker.husk.subject;
    const name = markerSubjectName(subject);
    findings.push({ subject: checkout.path, condition: `Checkout carries a husk stamp for ${subject.kind} ${name}.`,
      remedy: holderRemedy(subject.kind, name) });
  }
  return findings;
}

function markerSubjectName(subject: WorktreeSubject): string {
  return subject.kind === "work-unit" ? subject.name : subject.kind === "branch" ? subject.ref : subject.slug;
}

function holderRemedy(kind: string, name: string): string {
  if (kind === "work-unit") return `Preserve wanted work, then run arc teardown ${name}, then retry check.`;
  if (kind === "branch") return `Preserve wanted work, then run arc teardown --branch ${name}, then retry check.`;
  return "Preserve wanted work, then run arc errand close, arc errand abandon, or arc errand leave for the holder, then retry check.";
}

/** Explain each unmarked linked registration and the operation that removes it safely. */
export function windowUnmarkedCheckoutFindings(checkouts: readonly WindowCheckout[]): WindowFinding[] {
  return checkouts.filter(row => !row.primary && row.kind !== "marked" && row.kind !== "husk").map(row => ({
    subject: row.path,
    condition: `Unmarked linked checkout (${row.kind}) on ${row.branch ?? "detached HEAD"}.`,
    remedy: unmarkedRemovalRemedy(row),
  }));
}

function unmarkedRemovalRemedy(row: WindowCheckout): string {
  const path = JSON.stringify(row.path);
  if (row.kind === "missing-folder") {
    return `${row.locked !== undefined ? `Run git worktree unlock ${path}, then ` : "Run "}git worktree prune.`;
  }
  const branchRepair = row.branch === null ? "" : `make ${row.branch} clean, apply any tracked-state branch remedy reported by this check, push the branch, then `;
  const unlock = row.locked === undefined ? "" : `git worktree unlock ${path}, then `;
  return `Copy out anything wanted; ${branchRepair}run ${unlock}git worktree remove ${path}.${row.branch === null ? "" : " The branch survives."}`;
}
