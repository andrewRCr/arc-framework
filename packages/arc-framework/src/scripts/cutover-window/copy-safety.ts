/** Assert repository-copy isolation before a rehearsal may run an ARC command. */
import type { WindowCopyLayout } from "./copy.js";
import type { WindowHostPort } from "./host.js";
import { WindowRefusal, windowRead, type WindowFinding } from "./result.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { createWindowHost } from "./native-host.js";
import type { GitExec } from "../../lib/git/exec.js";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readGitDirectories } from "../../lib/git/directories.js";
import { windowPathContains } from "./paths.js";
import { scanRegisteredWorktrees } from "../../lib/git/worktree-roster.js";
import { readBackingRepository } from "../../lib/config/status-reader.js";
import { listWindowRefs } from "./git.js";
import { readWindowTransientRecords } from "./transients.js";
import { TransientIdentityRecordSchema } from "../../lib/errand/identity-record.js";

/** The host discovery boundary used to prove the copy has no repository on a host. */
export interface WindowCopySafetyOptions { host?: Pick<WindowHostPort, "discoverRepository"> }
/** The copy coordinates the isolation assertions read. */
export type WindowCopyBounds = Pick<WindowCopyLayout, "destination" | "repo" | "mirror">;

/** Refuse a copy until every isolation assertion is established, listing every failing subject together. */
export async function assertWindowCopySafety(layout: WindowCopyBounds, options: WindowCopySafetyOptions = {}): Promise<void> {
  const ports = createDefaultStorePorts({ checkoutRoot: layout.repo });
  const checkouts = await assertCopiedPointers(layout, ports.exec);
  // Git runs in the mirror only once it exists; a target that is not a copy has none.
  const mirror = await lstat(layout.mirror).then(stats => stats.isDirectory(), () => false) ? [layout.mirror] : [];
  const findings = mirror.length > 0 ? [] : [finding(layout.mirror, "The copy has no mirror repository.")];
  const execIn = (repo: string): GitExec => (command, args, execution) => ports.exec(command, args, { ...execution, cwd: repo });
  for (const repo of [...checkouts, ...mirror]) findings.push(...await isolationFindings(repo, execIn(repo), layout.mirror, options));
  for (const repo of [layout.repo, ...mirror]) findings.push(...await awaitingErrandFindings(repo, execIn(repo)));
  refuseAll(findings);
}

async function isolationFindings(repo: string, exec: GitExec, mirror: string, options: WindowCopySafetyOptions): Promise<WindowFinding[]> {
  const findings = await mirrorRemoteFindings(exec, repo, mirror);
  if (await readBackingRepository(repo) !== null) findings.push(finding(`${repo}:storage.backing_repository`, "A backing repository is configured."));
  // Discovery reads the repository's remotes, so it runs only where every remote names the mirror and nothing else is configured.
  if (findings.length > 0) return findings;
  const found = await windowRead(() => (options.host ?? createWindowHost({ repo, exec })).discoverRepository());
  if ("findings" in found) return found.findings;
  return found.value === null ? [] : [finding(repo, `Host discovery found ${found.value}.`)];
}

async function awaitingErrandFindings(repo: string, exec: GitExec): Promise<WindowFinding[]> {
  const io = { repo, exec }, refs = await listWindowRefs(io, ["refs/arc/user/"]);
  const snapshot = await readWindowTransientRecords(io, Object.fromEntries(refs));
  const findings = snapshot.findings.map(found => ({ subject: `${repo}:${found.subject}`, condition: found.condition,
    remedy: "Repair the identity snapshot on the live repository, then take a new copy." }));
  for (const entry of snapshot.records) {
    const record = TransientIdentityRecordSchema.parse(JSON.parse(entry.content));
    if (record.kind === "errand" && record.state === "awaiting-merge") {
      findings.push(finding(`${repo}:${record.slug}`, "A copied Errand is awaiting its merge; abandoning it would read its host pull request.",
        `Merge or abandon Errand ${record.slug} on the live repository, then take a new copy.`));
    }
  }
  return findings;
}

/** Gather every pointer naming a path outside the copy, refusing before Git reads the roster and again before it runs in a copied checkout. */
async function assertCopiedPointers(layout: WindowCopyBounds, boundary: GitExec): Promise<string[]> {
  const fs = { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") };
  const findings: WindowFinding[] = [];
  const inside = async (path: string) => {
    if (await windowPathContains(layout.destination, path)) return true;
    findings.push(finding(path, "A Git pointer names a path outside the copy."));
    return false;
  };
  // A checkout outside the copy is not read through: its folder may be gone, and its pointers lead further out.
  const checkout = async (path: string) => {
    if (!await inside(path)) return null;
    const dirs = await readGitDirectories(path, fs);
    const contained = [await inside(dirs.gitDir), await inside(dirs.commonDir)];
    return contained.every(Boolean) ? dirs.commonDir : null;
  };
  await inside(layout.mirror);
  const commonDir = await checkout(layout.repo);
  if (commonDir !== null) findings.push(...await commonGitfileFindings(commonDir, layout.destination));
  refuseAll(findings);
  const roster = await scanRegisteredWorktrees((command, args, options) => boundary(command, args, { ...options, cwd: layout.repo }));
  if (!roster.ok) throw new WindowRefusal([finding(layout.repo, `Cannot establish copied registrations: ${roster.message}`)]);
  for (const row of roster.worktrees) await checkout(row.path);
  refuseAll(findings);
  return roster.worktrees.map(row => row.path);
}

/** A checkout folder copied inside the common Git directory would keep a gitfile naming the live repository. */
async function commonGitfileFindings(directory: string, destination: string, top = true): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !(top && entry.name === "objects")) findings.push(...await commonGitfileFindings(path, destination, false));
    else if (entry.isFile() && entry.name === ".git") {
      const pointer = /^gitdir: (.+)$/mu.exec(await readFile(path, "utf8"))?.[1]?.trim();
      if (pointer !== undefined && !await windowPathContains(destination, resolve(directory, pointer))) {
        findings.push(finding(path, `A gitfile inside the copied Git directory names ${pointer}, outside the copy.`));
      }
    }
  }
  return findings;
}

async function mirrorRemoteFindings(exec: GitExec, repo: string, mirror: string): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  const names = (await exec("git", ["remote"])).stdout.trim().split("\n").filter(Boolean);
  for (const name of names) for (const direction of [[], ["--push"]]) {
    const urls = (await exec("git", ["remote", "get-url", ...direction, "--all", name])).stdout.trim().split("\n");
    if (urls.some(url => url !== mirror) && !findings.some(found => found.subject === `${repo}:${name}`)) {
      findings.push(finding(`${repo}:${name}`, "An effective remote URL does not name the copy's mirror."));
    }
  }
  return findings;
}

function finding(subject: string, condition: string,
  remedy = "Repair this copy's isolation and repeat copy safety before running any ARC command."): WindowFinding {
  return { subject, condition, remedy };
}

function refuseAll(findings: readonly WindowFinding[]): void {
  if (findings.length > 0) throw new WindowRefusal([...findings]);
}
