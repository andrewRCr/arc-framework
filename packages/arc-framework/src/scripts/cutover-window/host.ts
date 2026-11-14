/** Host facts used by the repository's cutover window, isolated behind one injectable boundary. */
import { z } from "zod";
import { WindowRefusal } from "./result.js";
import type { GitExec } from "../../lib/git/exec.js";

/** An open request whose branch targets affect quiescence. */
export interface WindowPullRequest { number: number; headBranch: string; baseBranch: string }
/** Complete open-request inventory and the flip request's auto-merge state. */
export interface WindowPullRequests {
  open: readonly WindowPullRequest[];
  flip: WindowPullRequest & { autoMergeArmed: boolean };
}
/** Host reads that tests replace and live tools bind to origin. */
export interface WindowHostPort {
  refs(patterns: readonly string[]): Promise<Readonly<Record<string, string>>>;
  pullRequests(flip: number): Promise<WindowPullRequests>;
  mergeSettings(): Promise<{ allowSquash: boolean; allowRebase: boolean }>;
  discoverRepository(): Promise<string | null>;
}
/** Rehearsal-only facts, accepted only when every effective remote URL is local. */
export interface SuppliedHostFacts { anchor?: string; pullRequests?: WindowPullRequests | (() => Promise<WindowPullRequests>) }
/** Resolved facts, retaining whether settings must be read from a real host. */
export interface WindowHostFacts { hosted: boolean; pullRequests: WindowPullRequests; anchor?: string }

/** Git reads a drive-letter URL as a local path only on Windows; elsewhere `C:` names an SSH host. */
function localUrl(url: string, platform: NodeJS.Platform): boolean {
  if (/^file:/iu.test(url) || platform === "win32" && /^[a-z]:[\\/]/iu.test(url)) return true;
  return !/^[^/\\:]+:/u.test(url);
}

/** Whether any effective fetch or push URL reaches a host, as Git on the given platform reads it. */
export async function hasWindowHost(exec: GitExec, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const names = (await exec("git", ["remote"])).stdout.trim().split("\n").filter(Boolean);
  for (const name of names) {
    const values = await Promise.all([
      exec("git", ["remote", "get-url", "--all", name]),
      exec("git", ["remote", "get-url", "--push", "--all", name]),
    ]);
    for (const value of values) {
      const urls = value.stdout.trim().split("\n").filter(Boolean);
      if (urls.length === 0) throw new WindowRefusal([{ subject: name, condition: "The remote has no effective URL.",
        remedy: "Configure the remote URL and retry." }]);
      if (urls.some(url => !localUrl(url, platform))) return true;
    }
  }
  return false;
}

/** Read request facts after enforcing the supplied-facts boundary. */
export async function readWindowHostFacts(
  io: { exec: GitExec; host: WindowHostPort }, flip: number, supplied: SuppliedHostFacts = {},
): Promise<WindowHostFacts> {
  const hosted = await hasWindowHost(io.exec);
  if (hosted && (supplied.anchor !== undefined || supplied.pullRequests !== undefined)) {
    throw new WindowRefusal([{ subject: "host facts", condition: "Supplied host facts are allowed only when every effective remote URL is local.",
      remedy: "Remove the supplied anchor and pull-request listing, then retry against origin's host." }]);
  }
  if (!hosted && supplied.pullRequests === undefined) {
    throw new WindowRefusal([{ subject: "pull-request listing", condition: "A supplied pull-request listing is required without a host.",
      remedy: "Supply the rehearsal's pull-request listing and retry." }]);
  }
  const suppliedRequests = supplied.pullRequests;
  const pullRequests = typeof suppliedRequests === "function"
    ? await suppliedRequests() : suppliedRequests ?? await io.host.pullRequests(flip);
  return { hosted, pullRequests, ...(supplied.anchor !== undefined ? { anchor: supplied.anchor } : {}) };
}

/** Validate a supplied listing and bind its flip request to the requested number. */
export function parseWindowPullRequests(value: unknown, flip: number): WindowPullRequests {
  const request = z.strictObject({ number: z.number().int().positive(), headBranch: z.string().min(1), baseBranch: z.string().min(1) });
  const listing = z.strictObject({ open: z.array(request), flip: request.extend({ autoMergeArmed: z.boolean() }) }).safeParse(value);
  if (!listing.success || listing.data.flip.number !== flip) throw new WindowRefusal([{ subject: "pull-request listing",
    condition: "The supplied listing is incomplete, invalid, or names a different flip request.",
    remedy: "Supply every open request's identity and the named flip's explicit auto-merge state, then retry." }]);
  return listing.data;
}
