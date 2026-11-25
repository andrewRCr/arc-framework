/** The run past the merge: the backfill restored, the last read guarding the merge, and the comparisons and close after it. */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { lastReadWindow } from "./last-read.js";
import { restoreWindow } from "./restore-operation.js";
import { compareWindow } from "./compare.js";
import { closeWindow } from "./close.js";
import { settleWindowOperation } from "./rehearse-expect.js";
import { expectRehearsalOperation, rehearsalFlipArgs } from "./rehearse-window.js";
import { WindowRehearsalStop, type WindowRehearsalContext, type WindowRehearsalPlan } from "./rehearse-run.js";
import { appendRehearsalLine, commitRehearsalBranch, markedRehearsalCheckouts, readRehearsalRecord,
  trackingCheckouts, unrecordedStateSides } from "./rehearse-plan-tools.js";
import { resolveArcPath } from "../../lib/layout/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { PRE_META_BACKFILL } from "./rehearse-plan-abort.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";
import { readWindowCheckouts } from "./checkouts.js";
import type { WindowRecord } from "./hold.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";

/** Import the aborted copy again, then guard, merge, compare, and refuse the close over late changes. */
export const mergeRehearsalPlan: WindowRehearsalPlan = {
  setup: async context => {
    const { sync } = context;
    await sync.checkout("main");
    const revert = (await sync.scratch(["log", "--format=%H", "--grep", `This reverts commit ${PRE_META_BACKFILL}`, "-n", "1", "HEAD"])).stdout.trim();
    if (revert === "") throw new WindowRehearsalStop("Main carries no revert of the pre-meta backfill to undo.");
    await sync.scratch(["revert", "--no-edit", revert]);
    await sync.publish("main", "HEAD");
    return `Restored the pre-meta backfill by reverting ${revert}.`;
  },
  after: async context => {
    const record = await readRehearsalRecord(context);
    const lines = [await guardTheMerge(context, record), await mergeTheStandIn(context)];
    lines.push(await compareAfterTheMerge(context, record), await refuseTheClose(context, record));
    return lines.join(" ");
  },
};

async function guardTheMerge(context: WindowRehearsalContext, record: WindowRecord): Promise<string> {
  const { sync } = context;
  await commitRehearsalBranch(context, context.flip.branch, "Delete the tracked state", async () => {
    await sync.scratch(["rm", "-r", "--quiet", "--ignore-unmatch", "--", ...WINDOW_TRACKED_STATE_ROOTS]);
    return [];
  });
  const main = record.branches.host.main ?? record.branches.local.main;
  if (!main) throw new WindowRehearsalStop("The hold records no main tip.");
  await sync.checkout("main");
  await sync.scratch(["commit", "--quiet", "--allow-empty", "-m", "Move the mirror's main"]);
  await sync.publishMirrorOnly("main", "HEAD");
  await expectRehearsalOperation(context, "last-read", lastReadWindow, rehearsalFlipArgs(context),
    { status: "refused", findings: [{ subject: "host:main", condition: "Changed branch tip" }] });
  await sync.publishMirrorOnly("main", main);
  sync.release("main");
  await expectRehearsalOperation(context, "last-read", lastReadWindow, rehearsalFlipArgs(context));
  return "last-read refused the mirror's moved main and passed once it was put back.";
}

async function mergeTheStandIn(context: WindowRehearsalContext): Promise<string> {
  const { sync } = context;
  await sync.checkout("main");
  await sync.scratch(["merge", "--quiet", "--no-ff", "--no-edit", `origin/${context.flip.branch}`]);
  await sync.publishMirrorOnly("main", "HEAD");
  await expectRehearsalOperation(context, "restore", restoreWindow, rehearsalFlipArgs(context),
    { status: "refused", findings: [{ subject: "merged flip", condition: "has merged" }] });
  return "restore refused the merged stand-in.";
}

async function compareAfterTheMerge(context: WindowRehearsalContext, record: WindowRecord): Promise<string> {
  const [moved, edited] = await markedRehearsalCheckouts(context, 2);
  if (!moved || !edited) throw new WindowRehearsalStop("Two marked checkouts are needed.");
  await commitRehearsalBranch(context, moved.branch, "Change state after the merge", scratch =>
    appendRehearsalLine(scratch, resolveArcPath({ kind: "inbox", scope: { kind: "project" } }), "Planted after the merge."));
  const identity = await createDefaultStorePorts({ checkoutRoot: context.layout.repo }).identity();
  if (identity === null) throw new WindowRehearsalStop("The copy has no configured identity.");
  const personal = join(edited.path, resolveArcPath({ kind: "user-document", identity,
    document: { kind: "session-notes", workUnit: SlugSchema.parse(edited.unit) } }));
  await mkdir(dirname(personal), { recursive: true });
  await appendFile(personal, "Edited after the merge.\n");
  const ranges: string[] = [];
  for (const branch of Object.keys(record.branches.live).filter(name => name !== "main" && name !== record.flip.branch).sort()) {
    const result = await settleWindowOperation("compare", compareWindow, { repo: context.layout.repo,
      args: ["--repo", context.layout.repo, "--branch", branch] });
    const found = (result.data as { ranges?: { side: string }[] } | undefined)?.ranges ?? [];
    if (result.status !== "reported" || (branch === moved.branch) !== (found.length > 0)) {
      throw new WindowRehearsalStop(`compare --branch ${branch} ${result.status} with ${found.length} range(s).`);
    }
    ranges.push(...found.map(range => `${range.side}/${branch}`));
  }
  for (const checkout of (await readWindowCheckouts({ repo: context.layout.repo, exec: context.exec })).filter(row => row.folderPresent)) {
    const result = await settleWindowOperation("compare", compareWindow, { repo: context.layout.repo,
      args: ["--repo", context.layout.repo, "--checkout", checkout.path] });
    const changed = (result.data as { changed?: boolean } | undefined)?.changed === true;
    if (result.status !== "reported" || changed !== (checkout.path === edited.path)) {
      throw new WindowRehearsalStop(`compare --checkout ${checkout.path} ${result.status}; digest changed ${String(changed)}.`);
    }
  }
  return `compare recorded ${ranges.join(", ")} and the personal-state change in ${edited.path}.`;
}

async function refuseTheClose(context: WindowRehearsalContext, record: WindowRecord): Promise<string> {
  const [moved] = await markedRehearsalCheckouts(context, 1);
  if (!moved) throw new WindowRehearsalStop("No marked checkout holds a branch.");
  const unconfirmed = ["local", "origin"].map(side => ({ subject: `${side}/${moved.branch}`, condition: "has confirmation (missing)" }));
  await expectRehearsalOperation(context, "close", closeWindow, [], { status: "refused", findings: [...await trackingCheckouts(context),
    ...await unrecordedStateSides(context, record), ...unconfirmed] });
  return "close refused, naming every checkout still tracking state and the unconfirmed range.";
}
