/** Resolve the sealing commit and verify checkout ancestry and built CLI freshness. */
import { readWindowRefTip, type WindowGitReadIO } from "./git.js";
import { WindowRefusal } from "./result.js";
import type { WindowFinding } from "./result.js";
import type { WindowCheckout } from "./checkouts.js";
import { isGitProcessError, isCompletedGitFailure } from "../../lib/git/process-error.js";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { checkDevBuildStaleness, createDevCheckDeps } from "../../lib/dev-check.js";

const checkSource = "packages/arc-framework/src/scripts/cutover-window/check.ts";
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

/** Refuse a present built CLI when the production self-hosting freshness check rejects it. */
export async function readWindowBuildFindings(checkouts: readonly WindowCheckout[]): Promise<WindowFinding[]> {
  return (await Promise.all(checkouts.map(async checkout => {
    const bundle = join(checkout.path, "packages", "arc-framework", "dist", "cli.js");
    try {
      return await checkoutBuildFindings(bundle);
    } catch (error) {
      return [{ subject: bundle, condition: `Built CLI freshness could not be established: ${error instanceof Error ? error.message : String(error)}`,
        remedy: "Repair the build path and source read access, then run npm run build:fast or remove the unused bundle and retry check." }];
    }
  }))).flat();
}

async function checkoutBuildFindings(bundle: string): Promise<WindowFinding[]> {
  try {
    await lstat(bundle);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const verdict = checkDevBuildStaleness(createDevCheckDeps(bundle));
  if (verdict.kind !== "stale") return [];
  return [{ subject: bundle, condition: `Stale built CLI (${verdict.basis}): ${verdict.basis === "content-hash" ? verdict.qualificationReason : "The built bundle is missing."}`,
    remedy: "Merge main into the branch, then run npm run build:fast in this checkout and retry check." }];
}

/** Require each registered checkout's captured head to contain the sealing anchor. */
export async function readWindowCheckoutAncestryFindings(io: WindowGitReadIO, checkouts: readonly WindowCheckout[],
  anchor: string): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const checkout of checkouts) {
    try {
      await io.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", anchor, checkout.head],
        { cwd: io.repo, objectAccess: "local-only" });
    } catch (error) {
      if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) {
        findings.push({ subject: checkout.path, condition: `Checkout head ${checkout.head} does not descend from sealing anchor ${anchor}.`,
          remedy: "Merge main into this branch, then run npm run build:fast in that checkout and retry check." });
      } else {
        findings.push({ subject: checkout.path, condition: `Sealing ancestry could not be proved: ${error instanceof Error ? error.message : String(error)}`,
          remedy: "Repair Git access and recover the checkout and anchor commits, then retry check." });
      }
    }
  }
  return findings;
}

/** Resolve an admitted rehearsal anchor or derive the source's addition on main's first-parent history. */
export async function readWindowSealAnchor(io: WindowGitReadIO, supplied?: string): Promise<string> {
  try {
    return await resolveWindowSealAnchor(io, supplied);
  } catch (error) {
    if (error instanceof WindowRefusal) throw error;
    throw new WindowRefusal([{ subject: "sealing anchor", condition: `The sealing anchor could not be read: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "Repair Git access and recover main or the intended rehearsal anchor commit, then retry check." }]);
  }
}

async function resolveWindowSealAnchor(io: WindowGitReadIO, supplied?: string): Promise<string> {
  if (supplied !== undefined) {
    const anchor = await readWindowRefTip(io, `${supplied}^{commit}`);
    if (anchor === null) throw new WindowRefusal([{ subject: "sealing anchor", condition: `Supplied anchor ${supplied} is not a readable commit.`,
      remedy: "Restore the intended rehearsal anchor commit and supply it again, then retry check." }]);
    return anchor;
  }
  const { stdout } = await io.exec("git", ["--no-replace-objects", "log", "--first-parent", "--reverse", "--diff-filter=A",
    "--format=%H", "refs/heads/main", "--", checkSource], { cwd: io.repo, objectAccess: "local-only" });
  const anchor = stdout.trim().split(/\r?\n/u)[0] ?? "";
  if (!oidPattern.test(anchor)) throw new WindowRefusal([{ subject: "sealing anchor",
    condition: "Main has no readable first-parent commit adding the window check source.",
    remedy: "Fetch main with the landed window tooling, or supply the intended anchor for a hostless rehearsal, then retry check." }]);
  return anchor;
}
