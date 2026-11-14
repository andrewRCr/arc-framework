/** The rehearsal's own Git preparation: merging main into a parked unit's branch, and dropping tracked-state stashes. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { makeGitExec } from "../helpers/integration.js";
import { mergeRehearsalMain } from "../../src/scripts/cutover-window/rehearse-merge.js";
import { dropRehearsalStashes } from "../../src/scripts/cutover-window/rehearse-prepare.js";
import { WindowRehearsalSync } from "../../src/scripts/cutover-window/rehearse-sync.js";
import type { WindowRehearsalContext } from "../../src/scripts/cutover-window/rehearse-run.js";

const pointer = ".arc/backlog/planned/meta-parked.md", active = ".arc/active/meta-parked.md";
const lines = Array.from({ length: 12 }, (_, index) => `Line ${index + 1} of the planned unit.`);

/** A mirror, its clone as the copy's primary, and a rehearsal context whose scratch clone writes to the mirror. */
async function rehearsalRepository() {
  const container = await mkdtemp(join(tmpdir(), "arc-window-rehearse-merge-"));
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
  const sync = new WindowRehearsalSync(layout, exec, async () => undefined);
  const context: WindowRehearsalContext = { layout, sync, exec, launcher: async () => { throw new Error("No ARC command runs here."); },
    environment: { path: "" }, flip: { branch: "feat/window-flip", pullRequest: 7 }, checkPath: "",
    importBounds: { prefix: [], heapMb: 1024 }, listing: join(workspace, "pull-requests.json") };
  return { repo, mirror, exec, git, write, sync, context };
}

it("keeps a parked branch's meta and pointer absence when main's park merges in cleanly", async () => {
  const r = await rehearsalRepository();
  await r.write(pointer, `${lines.join("\n")}\n`);
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Plan the unit");
  await r.git("checkout", "--quiet", "-b", "feat/parked");
  await mkdir(join(r.repo, dirname(active)), { recursive: true });
  await r.git("mv", pointer, active);
  const graduated = lines.map((line, index) => index === 1 ? "Line 2, graduated on the branch." : line);
  await r.write(active, `${graduated.join("\n")}\n`);
  await r.git("commit", "--quiet", "-am", "Graduate the unit");
  await r.git("checkout", "--quiet", "main");
  await r.write(pointer, `${lines.map((line, index) => index === 10 ? "Line 11, rewritten by the park." : line).join("\n")}\n`);
  await r.write("main-only.txt", "Main's other change.\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Park the unit");
  await r.git("push", "--quiet", "origin", "main", "feat/parked");
  await r.git("fetch", "--quiet", "origin");
  await r.sync.open();
  await mergeRehearsalMain(r.context, "feat/parked", [{ slug: "parked", path: pointer, branch: "feat/parked" }]);
  const at = (path: string) => r.exec("git", ["--git-dir", r.mirror, "show", `refs/heads/feat/parked:${path}`]);
  expect((await at(active)).stdout.trimEnd()).toBe(graduated.join("\n"));
  await expect(at(pointer)).rejects.toThrow();
  expect((await at("main-only.txt")).stdout.trimEnd()).toBe("Main's other change.");
  const parents = (await r.exec("git", ["--git-dir", r.mirror, "rev-list", "--parents", "-n", "1", "refs/heads/feat/parked"])).stdout.trim();
  expect(parents.split(" ")).toHaveLength(3);
}, 60_000);

it("keeps a parked branch's meta when main's park conflicts with it", async () => {
  const r = await rehearsalRepository();
  await r.write(pointer, `${lines.join("\n")}\n`);
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Plan the unit");
  await r.git("checkout", "--quiet", "-b", "feat/parked");
  await mkdir(join(r.repo, dirname(active)), { recursive: true });
  await r.git("mv", pointer, active);
  const graduated = lines.map((line, index) => index === 4 ? "Line 5, graduated on the branch." : line);
  await r.write(active, `${graduated.join("\n")}\n`);
  await r.git("commit", "--quiet", "-am", "Graduate the unit");
  await r.git("checkout", "--quiet", "main");
  await r.write(pointer, `${lines.map((line, index) => index === 4 ? "Line 5, rewritten by the park." : line).join("\n")}\n`);
  await r.git("commit", "--quiet", "-am", "Park the unit");
  await r.git("push", "--quiet", "origin", "main", "feat/parked");
  await r.sync.open();
  await mergeRehearsalMain(r.context, "feat/parked", [{ slug: "parked", path: pointer, branch: "feat/parked" }]);
  const at = (path: string) => r.exec("git", ["--git-dir", r.mirror, "show", `refs/heads/feat/parked:${path}`]);
  expect((await at(active)).stdout.trimEnd()).toBe(graduated.join("\n"));
  await expect(at(pointer)).rejects.toThrow();
}, 60_000);

it("drops only the stash entries that change tracked state, last position first", async () => {
  const r = await rehearsalRepository();
  await r.write(".arc/active/notes-alpha.md", "# Notes: Alpha\n");
  await r.write("code.txt", "code\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Start");
  const stash = async (path: string, content: string, message: string) => {
    await writeFile(join(r.repo, path), content);
    await r.git("stash", "push", "--quiet", "-m", message);
  };
  await stash(".arc/active/notes-alpha.md", "# Notes: Alpha\n\nFirst state edit.\n", "first state edit");
  await stash("code.txt", "changed code\n", "code edit");
  await stash(".arc/active/notes-alpha.md", "# Notes: Alpha\n\nSecond state edit.\n", "second state edit");
  expect(await dropRehearsalStashes(r.context)).toBe("Dropped 2 stash entries.");
  expect((await r.git("stash", "list", "--format=%gs")).stdout.trim()).toBe("On main: code edit");
  expect(await readFile(join(r.repo, ".arc/active/notes-alpha.md"), "utf8")).toBe("# Notes: Alpha\n");
}, 60_000);
