/** Native worktree locks protect marked checkouts and leave unrelated registrations alone. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { lockWindow, windowCheckoutLockFindings, type WindowLockOptions } from "../../src/scripts/cutover-window/lock.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

it("refuses an unlocked marked checkout and passes after its worktree lock is applied", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/alpha");
  await h.git("git", ["worktree", "add", path, "feat/alpha"]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" } });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringContaining("unlocked"), remedy: expect.stringContaining("lock") }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
  await h.git("git", ["worktree", "lock", "--reason", "Keep this checkout during the window", path]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

async function lockFixture(h: Awaited<ReturnType<typeof windowFixture>>, options?: WindowLockOptions) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["lock", "--repo", h.root, "--json"], options === undefined ? undefined : { lock: request => lockWindow(request, options) }, {
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
  });
  return { exit, result: stdout.length > 0 ? JSON.parse(stdout.join("")) as unknown : null, report: stderr.join("") };
}

it("locks each selected marked checkout and reports its path", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/alpha");
  await h.git("git", ["worktree", "add", path, "feat/alpha"]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" } });
  const locked = await lockFixture(h);
  expect(locked, locked.report).toMatchObject({ exit: 0, result: { status: "reported", data: { locked: [path] } } });
  expect(locked.report).toContain(`Locked ${path}`);
  expect(await readWindowCheckouts({ repo: h.root, exec: h.git })).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, locked: PROJECTION_LOCK_REASON }),
  ]));
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("preserves existing lock reasons and leaves unmarked checkouts unlocked without reporting them as newly locked", async () => {
  const h = await windowFixture();
  const cases = [
    { name: "unmarked", marked: false },
    { name: "manual", marked: true, reason: "Another tool's lock" },
    { name: "existing", marked: true, reason: PROJECTION_LOCK_REASON },
    { name: "new", marked: true },
  ];
  const paths = new Map<string, string>();
  for (const item of cases) {
    const path = join(h.root, ".arc-fixture", item.name);
    paths.set(item.name, path);
    await h.git("git", ["worktree", "add", "-b", `case/${item.name}`, path]);
    if (item.marked) await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew",
      createdAt: "2026-01-01T00:00:00.000Z", createdFor: { kind: "work-unit", name: "alpha" } });
    if (item.reason !== undefined) await h.git("git", ["worktree", "lock", "--reason", item.reason, path]);
  }
  const locked = await lockFixture(h);
  expect(locked, locked.report).toMatchObject({ exit: 0, result: { status: "reported", findings: [],
    messages: [`Locked ${paths.get("new")}`], data: { locked: [paths.get("new")] } } });
  const checkouts = await readWindowCheckouts({ repo: h.root, exec: h.git });
  for (const item of cases) {
    const checkout = checkouts.find(row => row.path === paths.get(item.name));
    expect(checkout, item.name).toBeDefined();
    expect(checkout?.locked).toBe(item.name === "new" ? PROJECTION_LOCK_REASON : item.reason);
  }
  expect(checkouts.find(row => row.primary)?.locked).toBeUndefined();
}, 30_000);

it("reports a failed lock, locks the remaining checkout, and retries the failed checkout after repair", async () => {
  const h = await windowFixture();
  for (const name of ["first", "second"]) {
    const path = join(h.root, ".arc-fixture", name);
    await h.git("git", ["worktree", "add", "-b", `case/${name}`, path]);
    await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
      createdFor: { kind: "work-unit", name: "alpha" } });
  }
  const marked = (await readWindowCheckouts({ repo: h.root, exec: h.git })).filter(row => row.kind === "marked");
  const blocked = marked[0], remaining = marked[1];
  if (blocked === undefined || remaining === undefined) throw new Error("The fixture requires two marked registrations");
  const exec: GitExec = async (command, args, execution) => {
    if (args[0] === "worktree" && args[1] === "lock" && args.at(-1) === blocked.path) {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "fixture lock access denied" });
    }
    return h.git(command, args, execution);
  };
  const observed = await lockFixture(h, { exec });
  expect(observed, observed.report).toMatchObject({ exit: 0, result: { status: "reported", data: { locked: [remaining.path] },
    findings: [expect.objectContaining({ subject: blocked.path, condition: expect.stringContaining("fixture lock access denied"),
      remedy: expect.stringContaining("run lock again") })] } });
  const after = await readWindowCheckouts({ repo: h.root, exec: h.git });
  expect(after.find(row => row.path === remaining.path)?.locked).toBe(PROJECTION_LOCK_REASON);
  expect(windowCheckoutLockFindings(after)).toEqual([expect.objectContaining({ subject: blocked.path })]);
  const retried = await lockFixture(h);
  expect(retried, retried.report).toMatchObject({ exit: 0, result: { findings: [], data: { locked: [blocked.path] } } });
  expect(windowCheckoutLockFindings(await readWindowCheckouts({ repo: h.root, exec: h.git }))).toEqual([]);
}, 30_000);
