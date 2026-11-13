/** Assert repository-copy isolation before a rehearsal may run an ARC command. */
import type { WindowCopyLayout } from "./copy.js";
import type { WindowHostPort } from "./host.js";
import { WindowRefusal } from "./result.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { createWindowHost } from "./native-host.js";
import type { GitExec } from "../../lib/git/exec.js";
import { lstat, readFile, realpath } from "node:fs/promises";
import { readGitDirectories } from "../../lib/git/directories.js";
import { localPathContains } from "../../lib/local-path-identity.js";
import { scanRegisteredWorktrees } from "../../lib/git/worktree-roster.js";
import { readBackingRepository } from "../../lib/config/status-reader.js";
import { listWindowRefs } from "./git.js";
import { readWindowTransientRecords } from "./transients.js";
import { TransientIdentityRecordSchema } from "../../lib/errand/identity-record.js";

/** The host discovery boundary used to prove the copy has no repository on a host. */
export interface WindowCopySafetyOptions { host?: Pick<WindowHostPort, "discoverRepository"> }
/** The copy coordinates the isolation assertions read. */
export type WindowCopyBounds = Pick<WindowCopyLayout, "destination" | "repo" | "mirror">;

/** Refuse a copy until every isolation assertion is established. */
export async function assertWindowCopySafety(layout: WindowCopyBounds, options: WindowCopySafetyOptions = {}): Promise<void> {
  const ports = createDefaultStorePorts({ checkoutRoot: layout.repo });
  const checkouts = await assertCopiedPointers(layout, ports.exec);
  for (const repo of [...checkouts, layout.mirror]) {
    const exec: GitExec = (command, args, execution) => ports.exec(command, args, { ...execution, cwd: repo });
    await assertMirrorRemotes(exec, repo, layout.mirror);
    if (await readBackingRepository(repo) !== null) refuse(`${repo}:storage.backing_repository`, "A backing repository is configured.");
    const host = options.host ?? createWindowHost({ repo, exec });
    const found = await host.discoverRepository();
    if (found !== null) refuse(repo, `Host discovery found ${found}.`);
  }
  for (const repo of [layout.repo, layout.mirror]) {
    const exec: GitExec = (command, args, execution) => ports.exec(command, args, { ...execution, cwd: repo });
    await assertNoAwaitingErrands(repo, exec);
  }
}

async function assertNoAwaitingErrands(repo: string, exec: GitExec): Promise<void> {
  const io = { repo, exec }, refs = await listWindowRefs(io, ["refs/arc/user/"]);
  const snapshot = await readWindowTransientRecords(io, Object.fromEntries(refs));
  if (snapshot.findings.length > 0) throw new WindowRefusal(snapshot.findings);
  for (const entry of snapshot.records) {
    const record = TransientIdentityRecordSchema.parse(JSON.parse(entry.content));
    if (record.kind === "errand" && record.state === "awaiting-merge") {
      refuse(`${repo}:${record.slug}`, "A copied Errand is awaiting its merge; abandoning it would read its host pull request.");
    }
  }
}

async function assertCopiedPointers(layout: WindowCopyBounds, boundary: GitExec): Promise<string[]> {
  const fs = { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") };
  const inside = async (path: string) => {
    if (!await localPathContains(layout.destination, path)) refuse(path, "A Git pointer names a path outside the copy.");
  };
  const checkout = async (path: string) => {
    await inside(path);
    const dirs = await readGitDirectories(path, fs);
    await inside(dirs.gitDir); await inside(dirs.commonDir);
  };
  await inside(layout.mirror);
  await checkout(layout.repo);
  const roster = await scanRegisteredWorktrees((command, args, options) => boundary(command, args, { ...options, cwd: layout.repo }));
  if (!roster.ok) refuse(layout.repo, `Cannot establish copied registrations: ${roster.message}`);
  for (const row of roster.worktrees) await checkout(row.path);
  return roster.worktrees.map(row => row.path);
}

async function assertMirrorRemotes(exec: GitExec, repo: string, mirror: string): Promise<void> {
  const names = (await exec("git", ["remote"])).stdout.trim().split("\n").filter(Boolean);
  for (const name of names) for (const direction of [[], ["--push"]]) {
    const urls = (await exec("git", ["remote", "get-url", ...direction, "--all", name])).stdout.trim().split("\n");
    if (urls.some(url => url !== mirror)) refuse(`${repo}:${name}`, "An effective remote URL does not name the copy's mirror.");
  }
}

function refuse(subject: string, condition: string): never {
  throw new WindowRefusal([{ subject, condition,
    remedy: "Repair this copy's isolation and repeat copy safety before running any ARC command." }]);
}
