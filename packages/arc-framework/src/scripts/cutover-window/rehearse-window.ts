/** The window's own steps on a prepared copy: lock, check, save, import, the sealed writes, and the checks after. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { lockWindow } from "./lock.js";
import { checkWindow } from "./check.js";
import { accountWindow } from "./account.js";
import { chainWindow } from "./chain.js";
import { recomputeWindow } from "./recompute.js";
import { readWindowCheckouts } from "./checkouts.js";
import { listWindowRefs } from "./git.js";
import type { WindowRequest } from "./main.js";
import type { WindowResult } from "./result.js";
import { expectWindowRehearsalResult, settleWindowOperation, type WindowRehearsalExpectation } from "./rehearse-expect.js";
import { runWindowRehearsalCommand, type WindowRehearsalCommand } from "./rehearse-launch.js";
import { runWindowRehearsalArc, WindowRehearsalStop, type WindowRehearsalContext } from "./rehearse-run.js";
import { observeRehearsalPublication } from "./rehearse-publication.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { resolveArcPath } from "../../lib/layout/index.js";
import { storeImportedRefusal } from "../../lib/store/store-imported.js";

const passed: WindowRehearsalExpectation = { status: "passed", findings: [] };
const identityRef = /^refs\/arc\/user\/[^/]+\/errands$/u;
const keptPrefix = "refs/arc/tmp/migrate/import/kept/";
const noEligibleFiles = "No eligible files found in user directory to save.";

/** Run one window operation on the copy's primary checkout and hold it to the expected outcome. */
export async function expectRehearsalOperation(context: WindowRehearsalContext, operation: string,
  handler: (request: WindowRequest) => Promise<WindowResult>, args: readonly string[],
  expected: WindowRehearsalExpectation = passed): Promise<string> {
  const repo = context.layout.repo;
  const result = await settleWindowOperation(operation, handler, { repo, args: ["--repo", repo, "--json", ...args] });
  return expectWindowRehearsalResult(result, expected);
}

/** The check's arguments for the copy: the stand-in flip, the supplied listing, the anchor, and the judged search path. */
export function rehearsalCheckArgs(context: WindowRehearsalContext): string[] {
  return [...rehearsalFlipArgs(context), "--path", context.checkPath, ...context.anchor === undefined ? [] : ["--anchor", context.anchor]];
}

/** The stand-in flip and its supplied pull-request listing, as `check`, `last-read`, and `restore` take them. */
export function rehearsalFlipArgs(context: WindowRehearsalContext): string[] {
  return ["--flip-branch", context.flip.branch, "--flip-pr", String(context.flip.pullRequest), "--pull-requests", context.listing];
}

/** Lock the marked linked checkouts; a failure to lock one is unexpected. */
export function lockRehearsal(context: WindowRehearsalContext): Promise<string> {
  return expectRehearsalOperation(context, "lock", lockWindow, [], { status: "reported", findings: [] });
}

/** Run the quiesce check on the copy, expecting it to pass and record the hold. */
export function checkRehearsal(context: WindowRehearsalContext): Promise<string> {
  return expectRehearsalOperation(context, "check", checkWindow, rehearsalCheckArgs(context));
}

/** Save each copied checkout's personal state through its launcher; a checkout with nothing to save passes. */
export async function saveRehearsalPersonalState(context: WindowRehearsalContext): Promise<string> {
  const checkouts = (await readWindowCheckouts({ repo: context.layout.repo, exec: context.exec })).filter(row => row.folderPresent);
  const empty: string[] = [];
  for (const checkout of checkouts) {
    const result = await runWindowRehearsalArc(context, checkout.path, ["--no-input", "user", "save"]);
    if (result.exitCode === 0) continue;
    if (`${result.stdout}${result.stderr}`.includes(noEligibleFiles)) { empty.push(checkout.path); continue; }
    throw commandStop(`Saving ${checkout.path}`, result);
  }
  return `Saved ${checkouts.length - empty.length} checkout(s)${empty.length > 0 ? `; nothing to save in ${empty.join(", ")}` : ""}.`;
}

/** Designate the mirror as the copy's state remote. */
export async function designateRehearsalRemote(context: WindowRehearsalContext): Promise<string> {
  const result = await runWindowRehearsalArc(context, context.layout.repo, ["--no-input", "store", "remote", "origin", "push"]);
  if (result.exitCode !== 0) throw commandStop("Designating the state remote", result);
  return "Designated the mirror as the state remote.";
}

/** The import's wall time and peak resident memory. */
export interface WindowRehearsalImportMeasurement { wallMs: number; peakRssMiB: number }

/** Import with publication to the mirror under the bounds, keeping its report and measuring it. */
export async function importRehearsal(context: WindowRehearsalContext,
  record: (measurement: WindowRehearsalImportMeasurement) => void): Promise<string> {
  const memory = join(context.layout.workspace, "import-peak-memory.json");
  await rm(memory, { force: true });
  const result = await runRehearsalImport(context, memory);
  await writeFile(join(context.layout.workspace, "import-report.json"), result.stdout);
  if (result.exitCode !== 0) throw commandStop("The import", result);
  const report = JSON.parse(result.stdout) as { status?: unknown };
  if (report.status !== "ok") throw new WindowRehearsalStop(`The import reported ${String(report.status)}.`);
  const peak = JSON.parse(await readFile(memory, "utf8")) as { maxRssKiB: number };
  const measurement = { wallMs: result.wallMs, peakRssMiB: Math.round(peak.maxRssKiB / 1024) };
  record(measurement);
  const published = await observeRehearsalPublication(context);
  return `Imported in ${measurement.wallMs} ms at ${measurement.peakRssMiB} MiB peak resident memory; the mirror holds all ${published} published store refs.`;
}

/** Run the import from the primary copy under the run's bounds, recording its peak memory to the named file. */
export async function runRehearsalImport(context: WindowRehearsalContext, memory: string): Promise<WindowRehearsalCommand> {
  const launch = await context.launcher(context.layout.repo), bounds = context.importBounds;
  const preload = pathToFileURL(join(import.meta.dirname, "peak-memory.mjs")).href;
  return runWindowRehearsalCommand(launch, ["--no-input", "store", "migrate", "--import", "--json"], { ...context.environment,
    prefix: bounds.prefix, env: { NODE_OPTIONS: `--max-old-space-size=${bounds.heapMb} --import ${preload}`, ARC_PEAK_MEMORY_FILE: memory } });
}

/** In each copied checkout with its own build, a write through the in-repo store refuses and changes nothing. */
export async function refuseRehearsalSealedWrites(context: WindowRehearsalContext): Promise<string> {
  if (context.inboxTitle === undefined) throw new WindowRehearsalStop("No inbox entry was found or planted to name.");
  const titleFile = join(context.layout.workspace, "inbox-title.txt");
  await writeFile(titleFile, context.inboxTitle);
  const identity = await createDefaultStorePorts({ checkoutRoot: context.layout.repo }).identity();
  if (identity === null) throw new WindowRehearsalStop("The copy has no configured identity.");
  const inbox = join(context.layout.repo, resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } }));
  const refused: string[] = [], without: string[] = [];
  for (const checkout of (await readWindowCheckouts({ repo: context.layout.repo, exec: context.exec })).filter(row => row.folderPresent)) {
    const launch = await context.launcher(checkout.path);
    if (!launch.own) { without.push(checkout.path); continue; }
    const before = await sealedState(context, checkout.path, inbox);
    const result = await runWindowRehearsalCommand(launch, ["--no-input", "user", "inbox-remove", "--inbox-title-file", titleFile],
      context.environment);
    if (result.exitCode === 0 || !`${result.stdout}${result.stderr}`.includes(storeImportedRefusal().condition)) {
      throw commandStop(`The sealed write in ${checkout.path}`, result);
    }
    if (JSON.stringify(await sealedState(context, checkout.path, inbox)) !== JSON.stringify(before)) {
      throw new WindowRehearsalStop(`The refused write in ${checkout.path} changed its status, refs, or inbox.`);
    }
    refused.push(checkout.path);
  }
  return `Refused in ${refused.length} checkout(s)${without.length > 0 ? `; no own build in ${without.join(", ")}` : ""}.`;
}

async function sealedState(context: WindowRehearsalContext, checkout: string, inbox: string) {
  return {
    status: (await context.sync.copy(checkout, ["status", "--porcelain", "--untracked-files=all"])).stdout,
    refs: (await context.sync.copy(checkout, ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout,
    inbox: (await readFile(inbox)).toString("base64"),
  };
}

/** The Errand identity refs are gone from the copy and the mirror, and the import's kept tips are dropped. */
export async function verifyRehearsalIdentityRefs(context: WindowRehearsalContext): Promise<string> {
  const remaining: string[] = [];
  for (const repo of [context.layout.repo, context.layout.mirror]) {
    const refs = await listWindowRefs({ repo, exec: context.exec }, ["refs/arc/"]);
    for (const ref of refs.keys()) if (identityRef.test(ref) || ref.startsWith(keptPrefix)) remaining.push(`${repo}: ${ref}`);
  }
  if (remaining.length > 0) throw new WindowRehearsalStop(`Identity refs or kept tips remain:\n${remaining.join("\n")}`);
  return "No identity ref or kept tip remains on the copy or the mirror.";
}

/** Account for every tracked file the import should have carried. */
export function accountRehearsal(context: WindowRehearsalContext, expected: WindowRehearsalExpectation = passed): Promise<string> {
  return expectRehearsalOperation(context, "account", accountWindow, [], expected);
}

/** Compare every Candidate chain through the repository and the imported store. */
export function chainRehearsal(context: WindowRehearsalContext): Promise<string> {
  return expectRehearsalOperation(context, "chain", chainWindow, ["--report", join(context.layout.workspace, "import-report.json")]);
}

/** Recompute the import's inputs against the hold. */
export function recomputeRehearsal(context: WindowRehearsalContext, expected: WindowRehearsalExpectation = passed): Promise<string> {
  return expectRehearsalOperation(context, "recompute", recomputeWindow, [], expected);
}

function commandStop(what: string, result: WindowRehearsalCommand): WindowRehearsalStop {
  return new WindowRehearsalStop(`${what} exited ${result.exitCode}: ${(result.stderr.trim() || result.stdout.trim()).slice(0, 4000)}`);
}
