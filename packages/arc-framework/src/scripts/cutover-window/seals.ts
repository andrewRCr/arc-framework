/** Resolve the sealing commit and verify checkout ancestry and built CLI freshness. */
import { readWindowRefTip, type WindowGitReadIO } from "./git.js";
import { WindowRefusal } from "./result.js";
import type { WindowFinding } from "./result.js";
import type { WindowCheckout } from "./checkouts.js";
import { isGitProcessError, isCompletedGitFailure } from "../../lib/git/process-error.js";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { checkDevBuildStaleness, createDevCheckDeps } from "../../lib/dev-check.js";
import { isGitObjectId } from "../../lib/git/object-id.js";

const checkSource = "packages/arc-framework/src/scripts/cutover-window/check.ts";

/** One checkout's built CLI: absent, fresh, stale with the freshness check's reason, or unreadable. */
export type WindowBuildState = { checkout: WindowCheckout; bundle: string } & (
  | { state: "absent" | "fresh" } | { state: "stale"; detail: string } | { state: "unreadable"; error: string });

/** Read each checkout's built CLI against the production self-hosting freshness check. */
export async function readWindowBuildStates(checkouts: readonly WindowCheckout[]): Promise<WindowBuildState[]> {
  return Promise.all(checkouts.map(async (checkout): Promise<WindowBuildState> => {
    const bundle = join(checkout.path, "packages", "arc-framework", "dist", "cli.js");
    try {
      return { checkout, bundle, ...await checkoutBuildState(bundle) };
    } catch (error) {
      return { checkout, bundle, state: "unreadable", error: error instanceof Error ? error.message : String(error) };
    }
  }));
}

/** Refuse a present built CLI when the production self-hosting freshness check rejects it. */
export async function readWindowBuildFindings(checkouts: readonly WindowCheckout[]): Promise<WindowFinding[]> {
  return (await readWindowBuildStates(checkouts)).flatMap((build): WindowFinding[] => {
    if (build.state === "unreadable") return [{ subject: build.bundle, condition: `Built CLI freshness could not be established: ${build.error}`,
      remedy: "Repair the build path and source read access, then run npm run build:fast or remove the unused bundle and retry check." }];
    if (build.state !== "stale") return [];
    return [{ subject: build.bundle, condition: `Stale built CLI ${build.detail}`,
      remedy: "Merge main into the branch, then run npm run build:fast in this checkout and retry check." }];
  });
}

async function checkoutBuildState(bundle: string): Promise<{ state: "absent" | "fresh" } | { state: "stale"; detail: string }> {
  try {
    await lstat(bundle);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return { state: "absent" };
    throw error;
  }
  const verdict = checkDevBuildStaleness(createDevCheckDeps(bundle));
  if (verdict.kind !== "stale") return { state: "fresh" };
  return { state: "stale",
    detail: `(${verdict.basis}): ${verdict.basis === "content-hash" ? verdict.qualificationReason : "The built bundle is missing."}` };
}

/** One checkout's captured head against the sealing anchor: it descends, it lacks the anchor, or Git could not tell. */
export type WindowCheckoutAncestry = { checkout: WindowCheckout } & (
  | { state: "descends" | "lacks" } | { state: "unreadable"; error: string });

/** Read whether each registered checkout's captured head contains the sealing anchor. */
export async function readWindowCheckoutAncestry(io: WindowGitReadIO, checkouts: readonly WindowCheckout[],
  anchor: string): Promise<WindowCheckoutAncestry[]> {
  const ancestry: WindowCheckoutAncestry[] = [];
  for (const checkout of checkouts) {
    try {
      await io.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", anchor, checkout.head],
        { cwd: io.repo, objectAccess: "local-only" });
      ancestry.push({ checkout, state: "descends" });
    } catch (error) {
      ancestry.push(isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1 ? { checkout, state: "lacks" }
        : { checkout, state: "unreadable", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return ancestry;
}

/** Require each registered checkout's captured head to contain the sealing anchor. */
export async function readWindowCheckoutAncestryFindings(io: WindowGitReadIO, checkouts: readonly WindowCheckout[],
  anchor: string): Promise<WindowFinding[]> {
  return (await readWindowCheckoutAncestry(io, checkouts, anchor)).flatMap(({ checkout, ...result }): WindowFinding[] => {
    if (result.state === "lacks") return [{ subject: checkout.path, condition: `Checkout head ${checkout.head} does not descend from sealing anchor ${anchor}.`,
      remedy: "Merge main into this branch, then run npm run build:fast in that checkout and retry check." }];
    if (result.state === "unreadable") return [{ subject: checkout.path, condition: `Sealing ancestry could not be proved: ${result.error}`,
      remedy: "Repair Git access and recover the checkout and anchor commits, then retry check." }];
    return [];
  });
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
  if (!isGitObjectId(anchor)) throw new WindowRefusal([{ subject: "sealing anchor",
    condition: "Main has no readable first-parent commit adding the window check source.",
    remedy: "Fetch main with the landed window tooling, or supply the intended anchor for a hostless rehearsal, then retry check." }]);
  return anchor;
}
