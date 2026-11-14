/** The rehearsal driver runs the window's sequence on a repository copy, and nowhere else. */
import { access, lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { invokeWindow } from "../helpers/cutover-window/run.js";
import { builtCliLauncher, cappedRehearsalArgs, rehearsalCopy, rehearsalHost } from "../helpers/cutover-window/rehearse.js";
import { makeGitExec } from "../helpers/integration.js";
import { rehearseWindow } from "../../src/scripts/cutover-window/rehearse.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import type { WindowRehearsalPlan } from "../../src/scripts/cutover-window/rehearse-run.js";
import { errandPlant, plantedErrandCollateral } from "../../src/scripts/cutover-window/rehearse-plan-abort.js";

/** A run that reaches the import needs a limit only Linux enforces and exposes. */
const linux = it.runIf(process.platform === "linux");

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

linux("leaves every copied checkout clean at its upstream and every changed branch equal on the mirror", async () => {
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
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", cappedRehearsalArgs,
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost, launcher: builtCliLauncher, plan }) });
  expect({ exit, result }, report).toMatchObject({ exit: 0, result: { status: "passed" } });
  expect(observed).toEqual({
    "main status": "", "main upstream": true, "feat/alpha status": "", "feat/alpha upstream": true,
    "feat/alpha mirrored": true, "rehearsal/flip mirrored": true, merged: true, inbox: "", ahead: "ahead",
    entry: "Rehearsal inbox entry",
  });
  expect(await readFile(join(copy.repo, ".arc/user/andrew/USER-INBOX.md"), "utf8")).toContain("### **Rehearsal inbox entry**");
}, 120_000);

linux("passes a run whose every step meets its expected outcome, a plant refusing and then passing", async () => {
  const { copy } = await rehearsalCopy();
  const alpha = (await readWindowCheckouts({ repo: copy.repo, exec: makeGitExec(copy.repo) })).find(row => !row.primary)?.path ?? "";
  const plan: WindowRehearsalPlan = { plants: [{ name: "unlock a marked checkout", point: "after lock",
    apply: async context => {
      await context.sync.copy(copy.repo, ["worktree", "unlock", alpha]);
      return [{ subject: alpha, condition: "The marked linked checkout is unlocked." }];
    },
    remove: async () => undefined,
  }] };
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", cappedRehearsalArgs,
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
  expect(data.import.addressSpaceLimitMiB).toBe(8192);
  expect(data.steps.find(step => step.step === "import")?.detail).toContain(`a ${data.import.heapLimitMiB} MiB heap ceiling`);
  expect(data.steps.find(step => step.step === "account")?.detail).toMatch(/^account passed; files: \d+ imported/u);
  expect(JSON.parse(await readFile(join(copy.destination, "rehearsal", "import-report.json"), "utf8"))).toMatchObject({ status: "ok" });
}, 180_000);

linux("stops at the first unexpected outcome, naming its step and running none after it", async () => {
  const { copy } = await rehearsalCopy();
  const plan: WindowRehearsalPlan = { account: async () => ({ status: "findings", findings: [] }) };
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", cappedRehearsalArgs,
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost, launcher: builtCliLauncher, plan }) });
  expect({ exit, result }, report).toMatchObject({ exit: 1, result: { status: "stopped",
    findings: [{ subject: "account", condition: "account passed, expected findings." }] } });
  const steps = (result?.data as { steps: { step: string; outcome: string }[] }).steps;
  expect(steps.at(-1)).toMatchObject({ step: "account", outcome: "stopped" });
  expect(steps.slice(0, -1).every(step => step.outcome === "passed")).toBe(true);
}, 180_000);

linux("opens the planted Errand without the copy's post-create provisioning, restoring the copy's configuration", async () => {
  const { copy } = await rehearsalCopy({ postCreate: "mkdir node_modules" });
  const git = makeGitExec(copy.repo), config = join(copy.repo, ".arc/system/arc-config.yml");
  const before = await readFile(config, "utf8"), observed: Record<string, unknown> = {};
  const plant = errandPlant();
  const plan: WindowRehearsalPlan = { plants: [{ ...plant, apply: async context => {
    const findings = await plant.apply(context);
    const errand = (await readWindowCheckouts({ repo: copy.repo, exec: git })).filter(row => !row.primary && row.branch !== "feat/alpha");
    observed.errands = errand.length;
    observed.provisioned = await Promise.all(errand.map(row => access(join(row.path, "node_modules")).then(() => true, () => false)));
    observed.config = await readFile(config, "utf8") === before;
    observed.flags = (await git("git", ["ls-files", "-v", "--", ".arc/system/arc-config.yml"])).stdout.slice(0, 1);
    return findings;
  } }], collateral: plantedErrandCollateral };
  const { exit, result, report } = await invokeWindow(copy.repo, "rehearse", cappedRehearsalArgs,
    { rehearse: request => rehearseWindow(request, { host: rehearsalHost, launcher: builtCliLauncher, plan }) });
  expect({ exit, result }, report).toMatchObject({ exit: 0, result: { status: "passed" } });
  expect(observed).toEqual({ errands: 1, provisioned: [false], config: true, flags: "H" });
}, 240_000);
