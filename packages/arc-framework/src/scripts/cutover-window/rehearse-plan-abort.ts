/** The run that ends in the abort: the backfill reverted, five planted conditions, a refused import, and the restore. */
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { closeWindow } from "./close.js";
import { recomputeWindow } from "./recompute.js";
import { restoreWindow } from "./restore-operation.js";
import type { WindowPullRequests } from "./host.js";
import { expectRehearsalOperation, rehearsalFlipArgs, runRehearsalImport } from "./rehearse-window.js";
import { runWindowRehearsalArc, WindowRehearsalStop, type WindowRehearsalContext, type WindowRehearsalPlan,
  type WindowRehearsalPlant } from "./rehearse-run.js";
import type { WindowRehearsalExpectation, WindowRehearsalExpectedFinding } from "./rehearse-expect.js";
import { appendRehearsalLine, commitRehearsalBranch, writeRehearsalFile, expectRehearsalRefs, markedRehearsalCheckouts, readRehearsalRecord,
  readRehearsalRefs, trackingCheckouts, unmarkedSides, unrecordedStateSides, verifyRehearsalRestore } from "./rehearse-plan-tools.js";
import { listWindowRefs, windowBranchValue } from "./git.js";
import { readWindowTransientRecords, isWindowIdentityRef } from "./transients.js";
import { readWindowCheckouts } from "./checkouts.js";
import { materializeArcPath, resolveArcPath } from "../../lib/layout/index.js";
import { ARC_CONFIG_SUFFIX } from "../../lib/constants.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { renderMetaFile } from "../../lib/store/kinds/meta/projection.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { TransientIdentityRecordSchema } from "../../lib/errand/identity-record.js";

/** The commit that gave the pre-meta work-unit folders their metas. */
export const PRE_META_BACKFILL = "68bddbb526affe700629c931daa1b9293b4fa456";
const splitRecord = ".arc/completed/2026-q1/completed-atomic-2026-q1.md";
const errandSlug = "rehearsal-planted-errand";
const divergingSlug = "rehearsal-diverging-copy";
const projectInbox = resolveArcPath({ kind: "inbox", scope: { kind: "project" } });

/** Plant the five check conditions, refuse a mis-keyed review boundary at the import, and abort through the restore. */
export const abortRehearsalPlan: WindowRehearsalPlan = {
  setup: async context => {
    await context.sync.checkout("main");
    await context.sync.scratch(["revert", "--no-edit", PRE_META_BACKFILL]);
    await context.sync.publish("main", "HEAD");
    return "Reverted the pre-meta backfill on main.";
  },
  plants: [sharedChangePlant(), openRequestPlant(), errandPlant(), unlockPlant(), divergingCopyPlant()],
  collateral: plantedErrandCollateral,
  beforeImport: refuseMiskeyedBoundary,
  account: expectBackfillOmission,
  after: abortThroughRestore,
};

function sharedChangePlant(): WindowRehearsalPlant {
  let planted: { branch: string; previous: string } | undefined;
  return { name: "a shared tracked-state change on a branch", point: "before lock",
    apply: async context => {
      const [checkout] = await markedRehearsalCheckouts(context, 2);
      if (!checkout) throw new WindowRehearsalStop("No marked checkout holds a branch.");
      const { previous, tip } = await commitRehearsalBranch(context, checkout.branch, "Change a shared record on a work branch",
        scratch => appendRehearsalLine(scratch, projectInbox, "Planted by the rehearsal."));
      planted = { branch: checkout.branch, previous };
      const condition = `Tracked state at ${projectInbox} differs from the import read`;
      return [{ subject: `refs/heads/${checkout.branch} (${tip})`, condition }, { subject: `refs/remotes/origin/${checkout.branch} (${tip})`, condition }];
    },
    remove: async context => {
      if (planted) await context.sync.reset(planted.branch, planted.previous);
    },
  };
}

function openRequestPlant(): WindowRehearsalPlant {
  return { name: "an open pull request", point: "before lock",
    apply: async context => {
      const listing = JSON.parse(await readFile(context.listing, "utf8")) as WindowPullRequests;
      const number = context.flip.pullRequest + 1;
      await writeFile(context.listing, JSON.stringify({ ...listing,
        open: [...listing.open, { number, headBranch: "rehearsal/open-request", baseBranch: "main" }] }));
      return [{ subject: `pull request #${number}`, condition: "could advance a live branch during the window" }];
    },
    remove: async context => {
      const listing = JSON.parse(await readFile(context.listing, "utf8")) as WindowPullRequests;
      await writeFile(context.listing, JSON.stringify({ ...listing,
        open: listing.open.filter(request => request.number !== context.flip.pullRequest + 1) }));
    },
  };
}

/** The planted Errand's checkout has no upstream, which the check reports beside the Errand's own findings. */
export async function plantedErrandCollateral(context: WindowRehearsalContext): Promise<WindowRehearsalExpectedFinding[]> {
  const errand = await plantedErrandCheckout(context);
  return [{ subject: `${errand.path} (${errand.branch})`, condition: "without an upstream" }];
}

/** Open an Errand in the copy, provisioned without the copy's post-create script, and abandon it on removal. */
export function errandPlant(): WindowRehearsalPlant {
  return { name: "an open Errand", point: "before lock",
    apply: async context => {
      const opened = await withoutCopiedPostCreate(context, () =>
        runWindowRehearsalArc(context, context.layout.repo, ["--no-input", "errand", "open", errandSlug, "--isolate"]));
      if (opened.exitCode !== 0) throw new WindowRehearsalStop(`Opening the planted Errand exited ${opened.exitCode}: ${opened.stderr.trim()}`);
      const condition = "An Errand record remains in";
      return [{ subject: `Errand ${errandSlug}`, condition: `${condition} local` }, { subject: `Errand ${errandSlug}`, condition: `${condition} origin` }];
    },
    remove: async context => {
      const checkout = await plantedErrandCheckout(context);
      const abandoned = await runWindowRehearsalArc(context, checkout.path, ["--no-input", "errand", "abandon", errandSlug]);
      if (abandoned.exitCode !== 0) throw new WindowRehearsalStop(`Abandoning the planted Errand exited ${abandoned.exitCode}: ${abandoned.stderr.trim()}`);
    },
  };
}

/**
 * The copy's post-create script installs and builds from the network, so the open runs with it blank, the file marked
 * skip-worktree so the primary still reads as the clean launchpad, and its bytes and index flag restored after.
 */
async function withoutCopiedPostCreate<T>(context: WindowRehearsalContext, run: () => Promise<T>): Promise<T> {
  const repo = context.layout.repo, path = join(materializeArcPath(repo, resolveArcPath({ kind: "arc-root" })), ...ARC_CONFIG_SUFFIX);
  const tracked = relative(repo, path), original = await readFile(path);
  await context.sync.copy(repo, ["update-index", "--skip-worktree", "--", tracked]);
  try {
    await writeFile(path, original.toString("utf8").replace(/^worktree\.post_create:[^\r\n]*/mu, "worktree.post_create:"));
    return await run();
  } finally {
    await writeFile(path, original);
    await context.sync.copy(repo, ["update-index", "--no-skip-worktree", "--", tracked]);
  }
}

async function plantedErrandCheckout(context: WindowRehearsalContext): Promise<{ path: string; branch: string }> {
  const io = { repo: context.layout.repo, exec: context.exec };
  const refs = Object.fromEntries([...await listWindowRefs(io, ["refs/arc/user/"])].filter(([ref]) => isWindowIdentityRef(ref)));
  const record = (await readWindowTransientRecords(io, refs)).records.map(entry => TransientIdentityRecordSchema.parse(JSON.parse(entry.content)))
    .find(entry => entry.slug === errandSlug);
  const checkout = (await readWindowCheckouts(io)).find(row => record !== undefined && row.branch === record.branch);
  if (!record || !checkout?.branch) throw new WindowRehearsalStop("The planted Errand's record or checkout cannot be found.");
  return { path: checkout.path, branch: checkout.branch };
}

function unlockPlant(): WindowRehearsalPlant {
  return { name: "an unlocked marked checkout", point: "after lock",
    apply: async context => {
      const [, checkout] = await markedRehearsalCheckouts(context, 2);
      if (!checkout) throw new WindowRehearsalStop("A second marked checkout is needed.");
      await context.sync.copy(context.layout.repo, ["worktree", "unlock", checkout.path]);
      return [{ subject: checkout.path, condition: "The marked linked checkout is unlocked." }];
    },
    remove: () => Promise.resolve(),
  };
}

function divergingCopyPlant(): WindowRehearsalPlant {
  const branch = `plan/${divergingSlug}`;
  return { name: "a diverging copy of an unheld live unit's branch", point: "before lock",
    apply: async context => {
      const identity = await createDefaultStorePorts({ checkoutRoot: context.layout.repo }).identity();
      const meta = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse(divergingSlug),
        placement: { kind: "active", scope: { kind: "project" } } });
      await commitRehearsalBranch(context, branch, "Start a live unit no checkout holds", scratch =>
        writeRehearsalFile(scratch, meta, renderMetaFile(divergingSlug, { state: "Active", owner: identity ?? "rehearsal", branch })), "origin/main");
      await context.sync.plantInCopy(context.layout.repo, branch, "Move the local side");
      await commitRehearsalBranch(context, branch, "Move the mirror's side", scratch => appendRehearsalLine(scratch, "REHEARSAL.md", "mirror"));
      return [{ subject: divergingSlug, condition: `is not an ancestor of selected read copy origin/${branch} (` }];
    },
    remove: async context => {
      const { sync } = context;
      await sync.scratch(["fetch", "--quiet", "--", context.layout.repo, `+refs/heads/${branch}:refs/rehearsal/${branch}`]);
      await sync.checkout(branch, `refs/rehearsal/${branch}`);
      await sync.scratch(["merge", "--quiet", "--no-edit", `origin/${branch}`]);
      sync.release(branch);
      await sync.publish(branch, "HEAD");
      await sync.sync();
    },
  };
}

async function refuseMiskeyedBoundary(context: WindowRehearsalContext): Promise<string> {
  const [held, other] = await markedRehearsalCheckouts(context, 2);
  if (!held || !other) throw new WindowRehearsalStop("Two marked checkouts are needed.");
  const unit = held.unit, foreign = other.unit;
  const record = await readRehearsalRecord(context);
  const recorded = windowBranchValue(record.branches.local, held.branch);
  if (recorded === undefined) throw new WindowRehearsalStop(`The hold records no local tip for ${held.branch}.`);
  const target = resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse(unit) });
  const source = (await context.sync.scratch(["ls-tree", "-r", "--name-only", "origin/main", "--", posix.dirname(target)])).stdout
    .split("\n").find(path => path.endsWith(".boundary.json"));
  if (!source) throw new WindowRehearsalStop("Main holds no review boundary to plant from.");
  await commitRehearsalBranch(context, held.branch, "Plant a review boundary filed under another work unit", async scratch => {
    const boundary = JSON.parse((await context.sync.scratch(["show", `origin/main:${source}`])).stdout) as Record<string, unknown>;
    return writeRehearsalFile(scratch, target, JSON.stringify({ ...boundary, workUnit: foreign }));
  });
  const memory = join(context.layout.workspace, "refused-import-peak-memory.json");
  await rm(memory, { force: true });
  const imported = await runRehearsalImport(context, memory);
  await writeFile(join(context.layout.workspace, "refused-import-report.json"), imported.stdout);
  const mismatch = `Stored record names ${foreign} instead of ${unit}`;
  if (imported.exitCode === 0 || !await exists(memory) || !importRefusedFor(imported.stdout, mismatch)) {
    throw new WindowRehearsalStop(`The import did not refuse the mis-keyed boundary with "${mismatch}" (exit ${imported.exitCode}): ${imported.stderr.trim() || imported.stdout.trim()}`);
  }
  expectRehearsalRefs("After the refused import, refs/arc/", await readRehearsalRefs(context, context.layout.repo, "refs/arc/"), record.refs.local);
  await context.sync.reset(held.branch, recorded);
  return `The import refused ${target} naming ${foreign}, with no refs/arc/ ref changed; ${held.branch} is back at ${recorded}.`;
}

/** Whether the import's own JSON refusal reports the planted key mismatch, rather than any other failure to run. */
function importRefusedFor(stdout: string, mismatch: string): boolean {
  try {
    const result = JSON.parse(stdout) as { status?: unknown; refusal?: { code?: unknown; report?: { notices?: { condition?: unknown }[] } } };
    return result.status === "refused" && result.refusal?.code === "import-refused"
      && (result.refusal.report?.notices ?? []).some(notice => typeof notice.condition === "string" && notice.condition.includes(mismatch));
  } catch { return false; }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function expectBackfillOmission(context: WindowRehearsalContext): Promise<WindowRehearsalExpectation> {
  const added = (await context.sync.copy(context.layout.repo, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=A",
    PRE_META_BACKFILL])).stdout.split("\n").filter(path => posix.basename(path).startsWith("meta-"));
  const folders = [...new Set(added.map(path => posix.dirname(path)))];
  const files = (await context.sync.copy(context.layout.repo, ["ls-tree", "-r", "--name-only", "refs/heads/main", "--", ...folders, splitRecord]))
    .stdout.split("\n").filter(Boolean);
  const findings: WindowRehearsalExpectedFinding[] = files.map(path => ({ subject: `refs/heads/main:${path}`,
    condition: "No record claims this file at its read revision." }));
  return { status: "findings", findings };
}

async function abortThroughRestore(context: WindowRehearsalContext): Promise<string> {
  const record = await readRehearsalRecord(context);
  await expectRehearsalOperation(context, "close", closeWindow, [], { status: "refused", findings: [
    { subject: "merged flip", condition: "The recorded flip is not merged." }, ...unmarkedSides(record),
    ...await unrecordedStateSides(context, record), ...await trackingCheckouts(context)] });
  const [checkout] = await markedRehearsalCheckouts(context, 1);
  if (!checkout) throw new WindowRehearsalStop("No marked checkout holds a branch.");
  const planted = await context.sync.plantInCopy(checkout.path, checkout.branch, "Move a checkout after the import");
  await expectRehearsalOperation(context, "recompute", recomputeWindow, [], { status: "refused", findings: [
    { subject: checkout.path, condition: "Changed HEAD" }, { subject: `local:${checkout.branch}`, condition: "Changed branch tip" }] });
  await expectRehearsalOperation(context, "restore", restoreWindow, rehearsalFlipArgs(context));
  const verified = await verifyRehearsalRestore(context, record);
  await context.sync.restoreInCopy(checkout.path, checkout.branch, planted.previous);
  return `close refused, recompute refused naming ${checkout.path}, restore passed. ${verified}`;
}
