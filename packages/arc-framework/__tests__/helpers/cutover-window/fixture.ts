/** Shared importing checkout with a local mirror and a supplied flip request. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs } from "../../../src/lib/git/worktree-marker.js";
import { importFixture } from "../store/import-fixture.js";
import type { WindowPullRequests } from "../../../src/scripts/cutover-window/host.js";

/** Build the clean pre-designation source used by the window's condition tests. */
export async function windowFixture(options: { sealed?: boolean; completed?: boolean; lineage?: boolean } = {}) {
  const h = await importFixture("default", options);
  const git = (...args: string[]) => h.git("git", args);
  if (options.sealed !== false) {
    const source = "packages/arc-framework/src/scripts/cutover-window/check.ts";
    await mkdir(dirname(join(h.root, source)), { recursive: true });
    await writeFile(join(h.root, source), "/** Window tooling sealing boundary. */\n");
    await git("add", source);
    await git("commit", "-m", "Land the window tooling seal");
    await git("branch", "-f", "feat/alpha", "HEAD");
  }
  await git("config", "--unset", "remote.origin.arc-state");
  const exclude = resolve(h.root, (await git("rev-parse", "--git-path", "info/exclude")).stdout.trim());
  await appendFile(exclude, "\n.arc-fixture/\n.arc/user/\n");
  await ensureWorktreeMarkerIgnored(h.root, h.git, nodeWorktreeMarkerIgnoreFs);
  await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/andrew/WORKING-MEMORY.md"), "# Working Memory\n\n## Memories\n");
  await git("checkout", "main");
  await git("rm", ".arc/active/meta-alpha.md");
  await git("commit", "-m", "Keep active ownership on its work branch");
  await git("push", "--set-upstream", "origin", "main");
  const activeMeta = ".arc/active/meta-alpha.md";
  const alphaMeta = (await git("show", `feat/alpha:${activeMeta}`)).stdout;
  await git("checkout", "feat/alpha");
  await git("merge", "--ff-only", "main");
  await writeFile(join(h.root, activeMeta), alphaMeta);
  await git("add", activeMeta);
  await git("commit", "-m", "Graduate active ownership after its base fork");
  await git("checkout", "main");
  await git("push", "--set-upstream", "origin", "feat/alpha");
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
