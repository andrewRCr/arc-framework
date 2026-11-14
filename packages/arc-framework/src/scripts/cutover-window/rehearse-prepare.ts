/** Bring a copy taken while sessions ran to the state the cleanup before the window leaves the live repository in. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listWindowRefs, readWindowRefTip } from "./git.js";
import { readWindowCheckouts } from "./checkouts.js";
import { createWindowImportContext } from "./import-context.js";
import { readWindowLiveState } from "./live-state.js";
import { inspectWindowTrackedRecords, type WindowTrackedRecordInspection } from "./tracked-records.js";
import { readWindowCheckoutAncestryFindings, readWindowSealAnchor } from "./seals.js";
import { readWindowTransientRecords, isWindowIdentityRef } from "./transients.js";
import { readWindowStashFindings } from "./stashes.js";
import { WindowRefusal } from "./result.js";
import { mergeRehearsalMain, returnRehearsalPaths } from "./rehearse-merge.js";
import { runWindowRehearsalArc, WindowRehearsalStop, type WindowRehearsalContext } from "./rehearse-run.js";
import type { WindowPullRequests } from "./host.js";
import { TransientIdentityRecordSchema } from "../../lib/errand/identity-record.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { resolveArcPath } from "../../lib/layout/index.js";
import { listInboxEntryTitles } from "../../lib/user-sync/inbox-writer.js";

const plantedTitle = "Rehearsal inbox entry";

/** Drop each copied checkout's changes, ignored files kept, and publish each branch ahead of its upstream. */
export async function cleanRehearsalCheckouts(context: WindowRehearsalContext): Promise<string> {
  const { sync, layout } = context, io = { repo: layout.repo, exec: context.exec };
  let dropped = 0;
  const published: string[] = [];
  for (const checkout of (await readWindowCheckouts(io)).filter(row => row.folderPresent)) {
    if ((await sync.copy(checkout.path, ["status", "--porcelain", "--untracked-files=all"])).stdout.trim() !== "") {
      await sync.copy(checkout.path, ["reset", "--quiet", "--hard"]);
      await sync.copy(checkout.path, ["clean", "--quiet", "-d", "--force"]);
      dropped += 1;
    }
    if (checkout.branch === null) continue;
    const upstream = (await sync.copy(layout.repo, ["for-each-ref", "--format=%(upstream)", `refs/heads/${checkout.branch}`])).stdout.trim();
    if (!upstream.startsWith("refs/remotes/origin/")) continue;
    const tip = await readWindowRefTip(io, upstream);
    if (tip === checkout.head || (tip !== null && !await sync.isAncestor(tip, checkout.head))) continue;
    await sync.publishLocal(checkout.branch, upstream.slice("refs/remotes/origin/".length));
    published.push(checkout.branch);
  }
  await sync.sync();
  return `Dropped changes in ${dropped} checkout(s); published ${published.length > 0 ? published.join(", ") : "no branch"}.`;
}

/** Merge main into each read copy main's tracked state outruns, then return each branch's remaining paths to their merge base. */
export async function remedyRehearsalTrackedState(context: WindowRehearsalContext): Promise<string> {
  const first = await inspectTrackedState(context);
  const merges = [...new Set(first.failures.filter(failure => !failure.target.branchTip)
    .map(failure => readCopyBranch(failure.result.readCopyRef, failure.result.path, failure.result.workUnit)))].sort();
  for (const branch of merges) await mergeRehearsalMain(context, branch, first.parked);
  if (merges.length > 0) await context.sync.sync();
  const second = await inspectTrackedState(context);
  const onMain = second.failures.filter(failure => !failure.target.branchTip);
  if (onMain.length > 0) throw new WindowRehearsalStop(`Main still holds tracked state the import would not read: ${onMain.map(failure => failure.result.path).join(", ")}.`);
  const returns = new Map<string, Set<string>>();
  for (const failure of second.failures) {
    const branch = branchName(failure.target.ref);
    returns.set(branch, (returns.get(branch) ?? new Set()).add(failure.result.path));
  }
  for (const [branch, paths] of [...returns].sort(([left], [right]) => left.localeCompare(right))) {
    await returnRehearsalPaths(context, branch, [...paths].sort());
  }
  if (returns.size > 0) await context.sync.sync();
  return `Merged main into ${merges.length > 0 ? merges.join(", ") : "no branch"}; returned paths on ${returns.size > 0 ? [...returns.keys()].sort().join(", ") : "no branch"}.`;
}

/** Merge main into each copied checkout's branch whose head lacks the sealing anchor. */
export async function remedyRehearsalSeals(context: WindowRehearsalContext): Promise<string> {
  const io = { repo: context.layout.repo, exec: context.exec };
  const anchor = await readWindowSealAnchor(io, context.anchor);
  const checkouts = await readWindowCheckouts(io);
  const lacking = new Set((await readWindowCheckoutAncestryFindings(io, checkouts, anchor)).map(finding => finding.subject));
  const branches: string[] = [];
  for (const checkout of checkouts.filter(row => lacking.has(row.path))) {
    if (checkout.branch === null) throw new WindowRehearsalStop(`The checkout ${checkout.path} lacks the sealing anchor and holds no branch.`);
    branches.push(checkout.branch);
  }
  const parked = branches.length > 0 ? (await inspectTrackedState(context)).parked : [];
  for (const branch of branches) await mergeRehearsalMain(context, branch, parked);
  if (branches.length > 0) await context.sync.sync();
  return `Merged main into ${branches.length > 0 ? branches.join(", ") : "no branch"}.`;
}

/** Publish each copied Errand's branch and abandon the Errand from its own copied checkout. */
export async function abandonRehearsalErrands(context: WindowRehearsalContext): Promise<string> {
  const io = { repo: context.layout.repo, exec: context.exec };
  const refs = Object.fromEntries([...await listWindowRefs(io, ["refs/arc/user/"])].filter(([ref]) => isWindowIdentityRef(ref)));
  const snapshot = await readWindowTransientRecords(io, refs);
  if (snapshot.findings.length > 0) throw new WindowRehearsalStop(snapshot.findings.map(finding => `${finding.subject}: ${finding.condition}`).join("\n"));
  const errands = snapshot.records.map(entry => TransientIdentityRecordSchema.parse(JSON.parse(entry.content)))
    .filter(record => record.kind === "errand" && record.purpose === "errand");
  for (const errand of errands) await context.sync.carryLocal(errand.branch);
  if (errands.length > 0) await context.sync.sync();
  const checkouts = await readWindowCheckouts(io);
  for (const errand of errands) {
    const holder = checkouts.find(row => row.branch === errand.branch) ?? checkouts.find(row => row.primary);
    if (!holder) throw new WindowRehearsalStop("The copy registers no primary checkout.");
    const result = await runWindowRehearsalArc(context, holder.path, ["--no-input", "errand", "abandon", errand.slug]);
    if (result.exitCode !== 0) throw new WindowRehearsalStop(`Abandoning Errand ${errand.slug} exited ${result.exitCode}: ${result.stderr.trim()}`);
  }
  return `Abandoned ${errands.length > 0 ? errands.map(errand => errand.slug).join(", ") : "no Errand"}.`;
}

/** Drop each stash entry that changes tracked state, last position first. */
export async function dropRehearsalStashes(context: WindowRehearsalContext): Promise<string> {
  const findings = await readWindowStashFindings({ repo: context.layout.repo, exec: context.exec });
  const positions = findings.map(finding => {
    const match = /^(stash@\{(\d+)\}): /u.exec(finding.subject);
    if (!match?.[1] || !finding.condition.startsWith("The stash changes tracked state")) {
      throw new WindowRehearsalStop(`${finding.subject}: ${finding.condition}`);
    }
    return { position: match[1], index: Number(match[2]) };
  }).sort((left, right) => right.index - left.index);
  for (const { position } of positions) await context.sync.copy(context.layout.repo, ["stash", "drop", "--quiet", position]);
  return `Dropped ${positions.length} stash entr${positions.length === 1 ? "y" : "ies"}.`;
}

/** Create the stand-in flip afresh from main plus one commit that changes no file, and list its pull request. */
export async function createRehearsalFlip(context: WindowRehearsalContext): Promise<string> {
  const { sync, flip } = context;
  await sync.checkout(flip.branch, "origin/main");
  await sync.scratch(["commit", "--quiet", "--allow-empty", "-m", "Stand in for the flip"]);
  await sync.publish(flip.branch, "HEAD", true);
  await sync.sync();
  const request = { number: flip.pullRequest, headBranch: flip.branch, baseBranch: "main" };
  const listing: WindowPullRequests = { open: [request], flip: { ...request, autoMergeArmed: false } };
  await writeFile(context.listing, `${JSON.stringify(listing, null, 2)}\n`);
  return `Created ${flip.branch} as pull request #${flip.pullRequest}.`;
}

/** Plant an Errand entry in the copied identity's inbox when it holds none, so the sealed write has one to name. */
export async function plantRehearsalInboxEntry(context: WindowRehearsalContext): Promise<string> {
  const identity = await createDefaultStorePorts({ checkoutRoot: context.layout.repo }).identity();
  if (identity === null) throw new WindowRehearsalStop("The copy has no configured identity.");
  const path = join(context.layout.repo, resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } }));
  const content = await readFile(path, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return "";
    throw error;
  });
  let titles = listInboxEntryTitles(content), planted = false;
  if (titles.length === 0) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, withErrandEntry(content, plantedTitle));
    titles = listInboxEntryTitles(await readFile(path, "utf8"));
    if (!titles.includes(plantedTitle)) throw new WindowRehearsalStop(`The planted inbox entry does not read back from ${path}.`);
    planted = true;
  }
  context.inboxTitle = titles[0];
  return planted ? `Planted inbox entry "${plantedTitle}".` : `The inbox already holds "${titles[0]}".`;
}

function withErrandEntry(content: string, title: string): string {
  const entry = `### **${title}**\n\nPlanted for the rehearsal.\n`;
  const lines = content.split("\n"), section = lines.findIndex(line => line.trim() === "## Errand");
  if (section === -1) return `${content}${content === "" || content.endsWith("\n") ? "" : "\n"}${content === "" ? "" : "\n"}## Errand\n\n${entry}`;
  return [...lines.slice(0, section + 1), "", entry, ...lines.slice(section + 1)].join("\n");
}

async function inspectTrackedState(context: WindowRehearsalContext): Promise<WindowTrackedRecordInspection> {
  const io = { repo: context.layout.repo, exec: context.exec };
  const [importContext, checkouts, refs] = await Promise.all([createWindowImportContext(context.layout.repo),
    readWindowCheckouts(io), listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/"])]);
  const local = selectBranches(refs, "refs/heads/"), origin = selectBranches(refs, "refs/remotes/origin/");
  const main = local.main;
  if (main === undefined) throw new WindowRehearsalStop("The copy has no main branch.");
  const live = await readWindowLiveState(importContext, checkouts, { local, origin });
  if (live.findings.length > 0) throw new WindowRefusal(live.findings);
  return inspectWindowTrackedRecords(importContext, { main, branches: Object.keys(live.branches), local, origin }, live.composition);
}

function selectBranches(refs: ReadonlyMap<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
    .map(([ref, tip]) => [ref.slice(prefix.length), tip]));
}

function readCopyBranch(ref: string | null, path: string, workUnit: string | null): string {
  const branch = ref === null ? null : branchName(ref);
  if (branch !== null && branch !== "main" && branch !== "HEAD" && !/^[a-f0-9]{40,64}$/u.test(branch)) return branch;
  throw new WindowRehearsalStop(`Main's ${path} fails the read rule${workUnit === null ? "" : ` for work unit ${workUnit}`}, `
    + `read at ${ref ?? "no revision"}, with no other branch to merge main into.`);
}

function branchName(ref: string): string {
  for (const prefix of ["refs/heads/", "refs/remotes/origin/", "origin/"]) if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  return ref;
}
