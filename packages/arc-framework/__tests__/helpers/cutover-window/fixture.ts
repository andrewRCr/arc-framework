/** Shared importing checkout with a local mirror and a supplied flip request. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { importFixture } from "../store/import-fixture.js";
import type { WindowPullRequests } from "../../../src/scripts/cutover-window/host.js";

/** Build the clean pre-designation source used by the window's condition tests. */
export async function windowFixture() {
  const h = await importFixture();
  const git = (...args: string[]) => h.git("git", args);
  await git("config", "--unset", "remote.origin.arc-state");
  const exclude = resolve(h.root, (await git("rev-parse", "--git-path", "info/exclude")).stdout.trim());
  await appendFile(exclude, "\n.arc-fixture/\n.arc/user/\n");
  await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/andrew/WORKING-MEMORY.md"), "# Working Memory\n\n## Memories\n");
  await git("checkout", "main");
  await git("push", "--set-upstream", "origin", "main");
  const branch = "feat/window-flip";
  await git("checkout", "-b", branch);
  await git("commit", "--allow-empty", "-m", "Window flip stand-in");
  const head = (await git("rev-parse", "HEAD")).stdout.trim();
  await git("push", "--set-upstream", "origin", branch);
  await git("checkout", "main");
  const request = { number: 7, headBranch: branch, baseBranch: "main" };
  const pullRequests: WindowPullRequests = { open: [request], flip: { ...request, autoMergeArmed: false } };
  const listingPath = join(h.root, ".arc-fixture/window-pull-requests.json");
  await writeFile(listingPath, JSON.stringify(pullRequests));
  return { ...h, flip: { branch, pullRequest: 7, head }, pullRequests, listingPath };
}
