/** The rehearsal driver runs the window's sequence on a repository copy, and nowhere else. */
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { invokeWindow } from "../helpers/cutover-window/run.js";
import { builtCliLauncher, rehearsalCopy, rehearsalHost } from "../helpers/cutover-window/rehearse.js";
import { makeGitExec } from "../helpers/integration.js";
import { rehearseWindow } from "../../src/scripts/cutover-window/rehearse.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import type { WindowRehearsalPlan } from "../../src/scripts/cutover-window/rehearse-run.js";

it("refuses a target that is not a repository copy before writing anything", async () => {
  const h = await windowFixture();
  const state = async () => ({
    refs: (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout,
    status: (await h.git("git", ["status", "--porcelain", "--ignored"])).stdout,
  });
  const before = await state();
  const { exit, result } = await invokeWindow(h.root, "rehearse", ["--anchor", "HEAD"],
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost }) });
  expect(exit).toBe(1);
  expect(result).toMatchObject({ operation: "rehearse", status: "refused",
    findings: [expect.objectContaining({ condition: expect.stringContaining("does not name the copy's mirror") })] });
  expect(await state()).toEqual(before);
  await expect(lstat(join(dirname(h.root), "rehearsal"))).rejects.toMatchObject({ code: "ENOENT" });
}, 60_000);

it("leaves every copied checkout clean at its upstream and every changed branch equal on the mirror", async () => {
  const { copy } = await rehearsalCopy();
  const git = makeGitExec(copy.repo);
  const tip = async (ref: string, cwd = copy.repo) => (await git("git", ["rev-parse", "--verify", "--quiet", ref], { cwd })).stdout.trim();
  const observed: Record<string, unknown> = {};
  const plan: WindowRehearsalPlan = { prepared: async context => {
    const checkouts = await readWindowCheckouts({ repo: copy.repo, exec: git });
    for (const checkout of checkouts) {
      observed[`${checkout.branch} status`] = (await git("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: checkout.path })).stdout;
      observed[`${checkout.branch} upstream`] = await tip(`refs/remotes/origin/${checkout.branch}`) === checkout.head;
    }
    for (const branch of ["feat/alpha", context.flip.branch]) {
      observed[`${branch} mirrored`] = await tip(`refs/heads/${branch}`) === await tip(`refs/heads/${branch}`, copy.mirror);
    }
    observed.merged = (await git("git", ["merge-base", "--is-ancestor", "refs/heads/main", "refs/heads/feat/alpha"])
      .then(() => true, () => false));
    observed.inbox = (await git("git", ["diff", "--name-only", "refs/heads/main", "refs/heads/feat/alpha", "--",
      ".arc/backlog/ATOMIC-INBOX.md"])).stdout;
    observed.ahead = (await git("git", ["show", "refs/heads/feat/alpha:ahead.txt"])).stdout;
    observed.entry = context.inboxTitle;
  } };
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", ["--path", ""],
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost, launcher: builtCliLauncher, plan }) });
  expect({ exit, result }, report).toMatchObject({ exit: 0, result: { status: "passed" } });
  expect(observed).toEqual({
    "main status": "", "main upstream": true, "feat/alpha status": "", "feat/alpha upstream": true,
    "feat/alpha mirrored": true, "rehearsal/flip mirrored": true, merged: true, inbox: "", ahead: "ahead",
    entry: "Rehearsal inbox entry",
  });
  expect(await readFile(join(copy.repo, ".arc/user/andrew/USER-INBOX.md"), "utf8")).toContain("### **Rehearsal inbox entry**");
}, 120_000);

it("passes a run whose every step meets its expected outcome, a plant refusing and then passing", async () => {
  const { copy } = await rehearsalCopy();
  const alpha = (await readWindowCheckouts({ repo: copy.repo, exec: makeGitExec(copy.repo) })).find(row => !row.primary)?.path ?? "";
  const plan: WindowRehearsalPlan = { plants: [{ name: "unlock a marked checkout", point: "after lock",
    apply: async context => {
      await context.sync.copy(copy.repo, ["worktree", "unlock", alpha]);
      return [{ subject: alpha, condition: "The marked linked checkout is unlocked." }];
    },
    remove: async () => undefined,
  }] };
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", ["--path", ""],
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost, launcher: builtCliLauncher, plan }) });
  expect({ exit, result }, report).toMatchObject({ exit: 0, result: { status: "passed", findings: [] } });
  const data = result?.data as { steps: { step: string; outcome: string; detail: string }[]; import: { wallMs: number; peakRssMiB: number; addressSpaceLimitMiB: unknown; heapLimitMiB: number } };
  expect(data.steps.map(step => step.step).slice(data.steps.findIndex(step => step.step === "lock"))).toEqual(["lock",
    "plant after lock", "check with plants", "remove plants", "lock again", "check", "save personal state",
    "designate the state remote", "import", "refuse sealed writes", "retire identity refs", "account", "chain", "recompute"]);
  expect(data.steps.every(step => step.outcome === "passed")).toBe(true);
  expect(data.steps.find(step => step.step === "import")?.detail).toMatch(/; the mirror holds all \d+ published store refs\.$/u);
  expect(data.import.wallMs).toBeGreaterThan(0);
  expect(data.import.peakRssMiB).toBeGreaterThan(0);
  expect(data.import.heapLimitMiB).toBeGreaterThan(0);
  expect(data.import).toHaveProperty("addressSpaceLimitMiB");
  expect(data.steps.find(step => step.step === "import")?.detail).toContain(`a ${data.import.heapLimitMiB} MiB heap ceiling`);
  expect(data.steps.find(step => step.step === "account")?.detail).toMatch(/^account passed; files: \d+ imported/u);
  expect(JSON.parse(await readFile(join(copy.destination, "rehearsal", "import-report.json"), "utf8"))).toMatchObject({ status: "ok" });
}, 180_000);

it("stops at the first unexpected outcome, naming its step and running none after it", async () => {
  const { copy } = await rehearsalCopy();
  const plan: WindowRehearsalPlan = { account: async () => ({ status: "findings", findings: [] }) };
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", ["--path", ""],
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost, launcher: builtCliLauncher, plan }) });
  expect({ exit, result }, report).toMatchObject({ exit: 1, result: { status: "stopped",
    findings: [{ subject: "account", condition: "account passed, expected findings." }] } });
  const steps = (result?.data as { steps: { step: string; outcome: string }[] }).steps;
  expect(steps.at(-1)).toMatchObject({ step: "account", outcome: "stopped" });
  expect(steps.slice(0, -1).every(step => step.outcome === "passed")).toBe(true);
}, 180_000);
