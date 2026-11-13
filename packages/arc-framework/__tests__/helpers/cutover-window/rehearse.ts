/** A small repository taken mid-session: a marked linked checkout that is dirty, ahead, and behind main's tracked state. */
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { copyWindow, type WindowCopyLayout } from "../../../src/scripts/cutover-window/copy.js";
import type { WindowRehearsalLauncher } from "../../../src/scripts/cutover-window/rehearse-launch.js";
import { CLI_PATH, assertCliBuilt } from "../cli-spawn.js";
import { windowFixture } from "./fixture.js";

/** Host discovery that finds no repository, so no test reads a host. */
export const rehearsalHost = { discoverRepository: async () => null };

/** Every copied checkout runs the package's built CLI, since a small copy holds no package or build. */
export const builtCliLauncher: WindowRehearsalLauncher = async checkout => {
  assertCliBuilt();
  return { argv: [process.execPath, CLI_PATH], cwd: checkout, own: true };
};

/** Build the source repository, take its copy with `copy`, and return the copy's layout. */
export async function rehearsalCopy(): Promise<{ source: Awaited<ReturnType<typeof windowFixture>>; copy: WindowCopyLayout }> {
  const h = await windowFixture();
  const git = (...args: string[]) => h.git("git", args);
  await writeFile(join(h.root, ".arc/active/extra-alpha.md"), "# Companion\n\nChanged on main after the work branch forked.\n");
  await git("commit", "--quiet", "-am", "Change alpha's companion on main");
  await git("push", "--quiet", "origin", "main");
  const alpha = join(h.root, ".arc-fixture/alpha");
  await git("worktree", "add", "--quiet", alpha, "feat/alpha");
  await writeWorktreeMarker(alpha, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" } });
  const inAlpha = (...args: string[]) => h.git("git", args, { cwd: alpha });
  await appendFile(join(alpha, ".arc/backlog/ATOMIC-INBOX.md"), "\nEdited on the work branch.\n");
  await inAlpha("commit", "--quiet", "-am", "Edit the project inbox on a work branch");
  await inAlpha("push", "--quiet", "origin", "feat/alpha");
  await writeFile(join(alpha, "ahead.txt"), "ahead\n");
  await inAlpha("add", "ahead.txt");
  await inAlpha("commit", "--quiet", "-m", "Work ahead of the upstream");
  await writeFile(join(alpha, "ahead.txt"), "dirty\n");
  await writeFile(join(alpha, "untracked.txt"), "untracked\n");
  await mkdir(join(alpha, ".arc/user/andrew/alpha"), { recursive: true });
  await writeFile(join(alpha, ".arc/user/andrew/alpha/SESSION-NOTES.md"), "# Session Notes\n");
  const container = await mkdtemp(join(tmpdir(), "arc-window-rehearse-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const copied = await copyWindow({ repo: h.root, args: ["--destination", join(container, "copy")] }, { host: rehearsalHost });
  return { source: h, copy: copied.data as WindowCopyLayout };
}
