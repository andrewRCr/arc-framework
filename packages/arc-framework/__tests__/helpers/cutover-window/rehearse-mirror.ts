/** A mirror, its clone as a rehearsal copy's primary, and a rehearsal context whose scratch clone writes to the mirror. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { makeGitExec } from "../integration.js";
import { WindowRehearsalSync } from "../../../src/scripts/cutover-window/rehearse-sync.js";
import type { WindowRehearsalContext } from "../../../src/scripts/cutover-window/rehearse-run.js";

/** Build an empty bare mirror on `main`, clone it as the copy's primary, and bind a sync and context to the pair. */
export async function rehearsalMirrorRepository(prefix: string, rebuild: (checkout: string) => Promise<void> = async () => undefined) {
  const container = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const mirror = join(container, "mirror.git"), repo = join(container, "primary"), workspace = join(container, "workspace");
  const exec = makeGitExec(container);
  await exec("git", ["init", "--quiet", "--bare", "-b", "main", mirror]);
  await exec("git", ["clone", "--quiet", mirror, repo]);
  const git = (...args: string[]) => exec("git", ["-c", "user.name=Owner", "-c", "user.email=owner@example.test", ...args], { cwd: repo });
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), content);
  };
  await mkdir(workspace);
  const layout = { destination: container, repo, mirror, worktrees: [{ source: repo, path: repo, primary: true }],
    workspace, scratch: join(workspace, "scratch") };
  const sync = new WindowRehearsalSync(layout, exec, rebuild);
  const context: WindowRehearsalContext = { layout, sync, exec, launcher: async () => { throw new Error("No ARC command runs here."); },
    environment: { path: "" }, flip: { branch: "feat/window-flip", pullRequest: 7 }, checkPath: "",
    importBounds: { prefix: [], heapMb: 1024 }, listing: join(workspace, "pull-requests.json") };
  return { repo, mirror, exec, git, write, sync, context };
}
