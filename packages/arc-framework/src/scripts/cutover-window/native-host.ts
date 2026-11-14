/** Native Git and GitHub reads for the explicitly targeted cutover repository. */
import { z } from "zod";
import { isGitProcessError } from "../../lib/git/process-error.js";
import type { GitExec } from "../../lib/git/exec.js";
import type { WindowHostPort, WindowPullRequest, WindowPullRequests } from "./host.js";
import { WindowRefusal } from "./result.js";
import { isWindowIdentityRef } from "./transients.js";

const requestSchema = z.object({ number: z.number().int().positive(), headRefName: z.string().min(1),
  baseRefName: z.string().min(1) });
const flipSchema = requestSchema.extend({ autoMergeRequest: z.record(z.string(), z.unknown()).nullable() });

function refuse(subject: string, condition: string): never {
  throw new WindowRefusal([{ subject, condition, remedy: "Repair access or the incomplete response and retry." }]);
}

function readRefLines(output: string, patterns: readonly string[]): Record<string, string> {
  return Object.fromEntries<string>(output.trim().split("\n").filter(Boolean).map((line): [string, string] => {
    const [oid, ref] = line.split(/\s+/u);
    if (oid === undefined || ref === undefined || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid)) {
      refuse("origin refs", "Malformed ref listing");
    }
    return [ref, oid];
  }).filter(([ref]) => patterns.some(pattern => {
    if (pattern === "refs/arc/user/*/errands") return isWindowIdentityRef(ref);
    return pattern.endsWith("*") ? ref.startsWith(pattern.slice(0, -1)) : ref === pattern;
  })));
}

function originRepository(url: string): { host: string; name: string; target: string } {
  const scp = /^(?:[^@/]+@)?([^/:]+):([^/].*)$/u.exec(url);
  let host: string; let path: string;
  if (scp && !url.includes("://")) { host = scp[1] ?? ""; path = scp[2] ?? ""; }
  else {
    try { const parsed = new URL(url); host = parsed.host; path = parsed.pathname; }
    catch { return refuse("origin", "Origin does not name a readable GitHub repository."); }
  }
  const name = path.replace(/^\//u, "").replace(/\.git\/?$/u, "").replace(/\/$/u, "");
  if (!host || !/^[^/\s]+\/[^/\s]+$/u.test(name)) refuse("origin", "Origin does not name a readable GitHub repository.");
  return { host, name, target: `${host}/${name}` };
}

function request(value: z.infer<typeof requestSchema>): WindowPullRequest {
  return { number: value.number, headBranch: value.headRefName, baseBranch: value.baseRefName };
}

/** Construct a lazy host port without reading remote or host state. */
export function createWindowHost(options: { exec: GitExec; repo: string; listingLimit?: number }): WindowHostPort {
  const invoke = (command: string, args: string[]) => options.exec(command, args, {
    cwd: options.repo, diagnosticLocale: "stable", signal: AbortSignal.timeout(30_000),
  });
  async function read(command: string, args: string[]): Promise<string> {
    try {
      return (await invoke(command, args)).stdout;
    } catch (error) {
      return refuse(`${command} ${args[0] ?? ""}`, error instanceof Error ? error.message : String(error));
    }
  }
  async function json<T>(args: string[], schema: z.ZodType<T>): Promise<T> {
    const output = await read("gh", args);
    try { return schema.parse(JSON.parse(output)); }
    catch { return refuse("GitHub response", "The host response is malformed or incomplete."); }
  }
  async function origin() { return originRepository((await read("git", ["remote", "get-url", "origin"])).trim()); }
  async function pullRequests(flip: number): Promise<WindowPullRequests> {
    const { target } = await origin();
    const limit = options.listingLimit ?? 1001;
    const open = await json(["pr", "list", "--repo", target, "--state", "open", "--limit", String(limit),
      "--json", "number,headRefName,baseRefName"], z.array(requestSchema));
    if (open.length >= limit) refuse("open pull requests", "The pull-request listing is possibly truncated at its limit.");
    const selected = await json(["pr", "view", String(flip), "--repo", target, "--json",
      "number,headRefName,baseRefName,autoMergeRequest"], flipSchema);
    if (selected.number !== flip) refuse("flip pull request", "The host returned a different pull request.");
    return { open: open.map(request), flip: { ...request(selected), autoMergeArmed: selected.autoMergeRequest !== null } };
  }
  return {
    refs: async patterns => readRefLines(await read("git", ["ls-remote", "origin", ...patterns]), patterns),
    pullRequests,
    mergeSettings: async () => {
      const { host, name } = await origin();
      const settings = await json(["api", "--hostname", host, `repos/${name}`],
        z.object({ allow_squash_merge: z.boolean(), allow_rebase_merge: z.boolean() }));
      return { allowSquash: settings.allow_squash_merge, allowRebase: settings.allow_rebase_merge };
    },
    discoverRepository: async () => {
      try {
        const { stdout } = await invoke("gh", ["repo", "view", "--json", "nameWithOwner"]);
        return z.object({ nameWithOwner: z.string().regex(/^[^/\s]+\/[^/\s]+$/u) }).parse(JSON.parse(stdout)).nameWithOwner;
      } catch (error) {
        if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1 &&
          error.stderr.includes("none of the git remotes configured for this repository point to a known GitHub host")) return null;
        return refuse("GitHub repository discovery", error instanceof Error ? error.message : String(error));
      }
    },
  };
}
