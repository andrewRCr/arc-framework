/** Read physical checkout cleanliness without fetching or moving branch tips. */
import { readWindowRefTip, type WindowGitReadIO } from "./git.js";
import type { WindowCheckout } from "./checkouts.js";
import type { WindowFinding } from "./result.js";
import { countAheadBehindRef } from "../../lib/git/worktree-sync.js";
import type { ImportPersonalLink } from "../../lib/store/ref/import/personal-disk.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";
import { windowPersonalCheckoutPath } from "./digests.js";

/** Name dirty primary and marked checkouts, forcing untracked files into the native observation. */
export async function readWindowCheckoutStatusFindings(io: WindowGitReadIO, checkouts: readonly WindowCheckout[]): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const checkout of selectedCheckouts(checkouts)) {
    const subject = `${checkout.path} (${checkout.branch ?? "detached"})`;
    try {
      const status = await io.exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        { cwd: checkout.path, objectAccess: "local-only", preserveOutput: true });
      if (status.stdout.length > 0) findings.push({ subject, condition: `The checkout is dirty, including untracked files: ${JSON.stringify(status.stdout)}.`,
        remedy: "Finish the work and commit and push it, or drop the changes, then retry check." });
    } catch (error) {
      findings.push({ subject, condition: `Cannot read checkout cleanliness: ${error instanceof Error ? error.message : String(error)}`,
        remedy: "Restore Git access in this checkout, then retry check." });
    }
  }
  return findings;
}

/** Compare selected checkout heads with their configured fetched upstreams without transport. */
export async function readWindowCheckoutUpstreamFindings(io: WindowGitReadIO, checkouts: readonly WindowCheckout[]): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const checkout of selectedCheckouts(checkouts)) {
    try { findings.push(...await checkoutUpstreamFindings(io, checkout)); }
    catch (error) {
      findings.push({ subject: `${checkout.path} (${checkout.branch ?? "detached"})`,
        condition: `Cannot read checkout upstream: ${error instanceof Error ? error.message : String(error)}`,
        remedy: "Restore Git access and the upstream ref in this checkout, then retry check." });
    }
  }
  return findings;
}

/** Name ignored files under the tracked import's roots, leaving machine-local state outside those roots alone. */
export async function readWindowIgnoredStateFindings(io: WindowGitReadIO, checkouts: readonly WindowCheckout[]): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const checkout of selectedCheckouts(checkouts)) {
    const subject = `${checkout.path} (${checkout.branch ?? "detached"})`;
    try {
      const { stdout } = await io.exec("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", ...WINDOW_TRACKED_STATE_ROOTS],
        { cwd: checkout.path, objectAccess: "local-only", preserveOutput: true });
      findings.push(...stdout.split("\0").filter(path => path !== "").map(path => ({ subject,
        condition: `The checkout holds ignored tracked-state file ${path}.`,
        remedy: "Move the ignored file out of the tracked-state paths, then retry check." })));
    } catch (error) {
      findings.push({ subject, condition: `Cannot read ignored tracked state: ${error instanceof Error ? error.message : String(error)}`,
        remedy: "Restore Git access in this checkout, then retry check." });
    }
  }
  return findings;
}

async function checkoutUpstreamFindings(io: WindowGitReadIO, checkout: WindowCheckout): Promise<WindowFinding[]> {
  const subject = `${checkout.path} (${checkout.branch ?? "detached"})`;
  if (checkout.branch === null || checkout.detached) return [{ subject, condition: "The checkout is detached.",
    remedy: "Check out the intended branch with a fetched upstream, then retry check." }];
  const { stdout } = await io.exec("git", ["for-each-ref", "--format=%(upstream)", `refs/heads/${checkout.branch}`],
    { cwd: checkout.path, objectAccess: "local-only", preserveOutput: true });
  const refs = stdout.split(/\r?\n/u).filter(ref => ref !== "");
  if (refs.length > 1) throw new Error("The branch's configured upstream is not unique.");
  const upstream = refs[0];
  const tip = upstream?.startsWith("refs/remotes/") === true
    ? await readWindowRefTip({ repo: checkout.path, exec: io.exec }, upstream) : null;
  if (upstream === undefined || tip === null) return [{ subject, condition: "The checkout is without an upstream with a fetched tip.",
    remedy: "Set the branch's upstream and fetch it before running the check, then retry check." }];
  if (checkout.head === tip) return [];
  const distance = await countAheadBehindRef((command, args, options) => io.exec(command, ["--no-replace-objects", ...args],
    { ...options, cwd: checkout.path, objectAccess: "local-only" }), checkout.head, tip);
  const detail = [distance.ahead > 0 ? `ahead by ${distance.ahead}` : "", distance.behind > 0 ? `behind by ${distance.behind}` : ""]
    .filter(Boolean).join(" and ") || "different tips";
  return [{ subject, condition: `The checkout differs from fetched upstream ${upstream}: ${detail}.`,
    remedy: "Bring the branch and its fetched upstream to the same tip by pushing or integrating its changes, then retry check." }];
}

function selectedCheckouts(checkouts: readonly WindowCheckout[]): WindowCheckout[] {
  return checkouts.filter(checkout => checkout.primary || checkout.kind === "marked");
}

/** Name personal links owned by the primary or a marked checkout without following their targets. */
export function windowPersonalLinkFindings(checkouts: readonly WindowCheckout[], links: readonly ImportPersonalLink[]): WindowFinding[] {
  const selected = new Map(selectedCheckouts(checkouts).map(checkout => [checkout.path, checkout]));
  return links.flatMap(link => {
    const owner = windowPersonalCheckoutPath(checkouts, link.physicalPath);
    const checkout = owner === undefined ? undefined : selected.get(owner);
    return checkout === undefined ? [] : [{ subject: `${checkout.path} (${checkout.branch ?? "detached"})`,
      condition: `The checkout holds personal link ${link.physicalPath}.`,
      remedy: "Replace the personal link with the files it points to, or remove it, then retry check." }];
  });
}
