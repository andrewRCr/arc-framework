/** What the repository's run plans share: the copy's marked checkouts, branch plants, the hold, and the restore checks. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readWindowCheckouts, type WindowCheckout } from "./checkouts.js";
import { readWindowHold, type WindowRecord } from "./hold.js";
import { listWindowRefs } from "./git.js";
import { WindowRehearsalStop, type WindowRehearsalContext } from "./rehearse-run.js";
import type { WindowRehearsalExpectedFinding } from "./rehearse-expect.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { storeImported } from "../../lib/store/store-imported.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";

/** A linked checkout a work unit's marker holds, with the unit it names and the branch it holds. */
export type WindowRehearsalUnitCheckout = WindowCheckout & { branch: string; unit: string };

/** The linked checkouts whose current marker names a work unit and that hold a branch, in branch order. */
export function workUnitRehearsalCheckouts(rows: readonly WindowCheckout[]): WindowRehearsalUnitCheckout[] {
  return rows.flatMap(row => {
    const subject = row.ownership?.kind === "current" ? row.ownership.subject : undefined;
    return row.kind === "marked" && !row.primary && row.branch !== null && subject?.kind === "work-unit"
      ? [{ ...row, branch: row.branch, unit: subject.name }] : [];
  }).sort((left, right) => left.branch.localeCompare(right.branch));
}

/** The copy's work-unit checkouts holding branches, in branch order; a plan needs at least `count`. */
export async function markedRehearsalCheckouts(context: WindowRehearsalContext, count: number): Promise<WindowRehearsalUnitCheckout[]> {
  const rows = workUnitRehearsalCheckouts(await readWindowCheckouts({ repo: context.layout.repo, exec: context.exec }));
  if (rows.length < count) throw new WindowRehearsalStop(`The plan needs ${count} work units' marked checkouts holding branches; the copy has ${rows.length}.`);
  return rows;
}

/** Commit a change on a mirror branch through the scratch clone, then carry it into the copy; returns both tips. */
export async function commitRehearsalBranch(context: WindowRehearsalContext, branch: string, message: string,
  change: (scratch: string) => Promise<readonly string[]>, from?: string): Promise<{ previous: string; tip: string }> {
  const { sync } = context;
  await sync.checkout(branch, from);
  const previous = (await sync.scratch(["rev-parse", "HEAD"])).stdout.trim();
  const paths = await change(sync.layout.scratch);
  await sync.scratch(["add", "--all", "--", ...paths]);
  await sync.scratch(["commit", "--quiet", "--allow-empty", "-m", message]);
  await sync.publish(branch, "HEAD");
  await sync.sync();
  return { previous, tip: (await sync.scratch(["rev-parse", "HEAD"])).stdout.trim() };
}

/** Write a file in the scratch clone, creating its folder where the branch holds none; returns the path for staging. */
export async function writeRehearsalFile(scratch: string, path: string, content: string): Promise<readonly string[]> {
  await mkdir(dirname(join(scratch, path)), { recursive: true });
  await writeFile(join(scratch, path), content);
  return [path];
}

/** Append a line to a file in the scratch clone, creating it where absent; returns the path for staging. */
export async function appendRehearsalLine(scratch: string, path: string, line: string): Promise<readonly string[]> {
  await mkdir(dirname(join(scratch, path)), { recursive: true });
  await appendFile(join(scratch, path), `${line}\n`);
  return [path];
}

/** The hold's record, as the copy holds it now. */
export async function readRehearsalRecord(context: WindowRehearsalContext): Promise<WindowRecord> {
  const io = { repo: context.layout.repo, exec: context.exec, execInput: createDefaultStorePorts({ checkoutRoot: context.layout.repo }).execInput };
  return (await readWindowHold(io)).record;
}

/** The refs under a prefix in one repository, as a plain record. */
export async function readRehearsalRefs(context: WindowRehearsalContext, repo: string, prefix: string): Promise<Record<string, string>> {
  return Object.fromEntries(await listWindowRefs({ repo, exec: context.exec }, [prefix]));
}

/** Stop unless two ref listings agree exactly, naming each ref that differs. */
export function expectRehearsalRefs(what: string, observed: Readonly<Record<string, string>>, recorded: Readonly<Record<string, string>>): void {
  const names = [...new Set([...Object.keys(observed), ...Object.keys(recorded)])].sort();
  const differing = names.filter(name => observed[name] !== recorded[name]);
  if (differing.length > 0) {
    throw new WindowRehearsalStop(`${what} differ from the hold: ${differing.map(name => `${name} recorded ${recorded[name] ?? "absent"}, observed ${observed[name] ?? "absent"}`).join("; ")}.`);
  }
}

/** After the restore: every recorded ref back on the copy and the mirror, the rest gone, nothing imported, and no hold. */
export async function verifyRehearsalRestore(context: WindowRehearsalContext, record: WindowRecord): Promise<string> {
  const { repo, mirror } = context.layout;
  expectRehearsalRefs("The copy's refs/arc/ refs", await readRehearsalRefs(context, repo, "refs/arc/"), record.refs.local);
  expectRehearsalRefs("The mirror's refs/arc/ refs", await readRehearsalRefs(context, mirror, "refs/arc/"), record.refs.origin);
  expectRehearsalRefs("The copy's tracking refs", await readRehearsalRefs(context, repo, "refs/arc-remotes/origin/"), record.refs.tracking);
  const held = await readRehearsalRefs(context, repo, "refs/arc-window/");
  if (Object.keys(held).length > 0) throw new WindowRehearsalStop(`The hold remains: ${Object.keys(held).join(", ")}.`);
  const imported: string[] = [];
  for (const checkout of await readWindowCheckouts({ repo, exec: context.exec })) {
    if (checkout.folderPresent && await storeImported(checkout.path, context.exec)) imported.push(checkout.path);
  }
  if (imported.length > 0) throw new WindowRehearsalStop(`The store still reads as imported in ${imported.join(", ")}.`);
  return "Every recorded ref is back on the copy and the mirror, nothing reads as imported, and the hold is gone.";
}

/** The `close` finding for each recorded side of a live branch that `compare` has not marked. */
export function unmarkedSides(record: WindowRecord): WindowRehearsalExpectedFinding[] {
  const findings: WindowRehearsalExpectedFinding[] = [];
  for (const [branch, tips] of Object.entries(record.branches.live)) {
    if (branch === "main" || branch === record.flip.branch) continue;
    for (const side of ["local", "origin"] as const) {
      if (tips[side] !== null) findings.push({ subject: `${side}/${branch}`, condition: "has no comparison mark" });
    }
  }
  return findings;
}

/** The `close` finding for each present side of a branch the hold does not record whose tip on either side tracks state. */
export async function unrecordedStateSides(context: WindowRehearsalContext, record: WindowRecord): Promise<WindowRehearsalExpectedFinding[]> {
  const { repo, mirror } = context.layout;
  const heads = async (where: string) => new Map(Object.entries(await readRehearsalRefs(context, where, "refs/heads/"))
    .map(([ref, tip]) => [ref.slice("refs/heads/".length), tip]));
  const local = await heads(repo), origin = await heads(mirror);
  const tracks = async (where: string, tip: string | undefined) => tip !== undefined
    && (await context.sync.copy(where, ["ls-tree", "-r", "--name-only", tip, "--", ...WINDOW_TRACKED_STATE_ROOTS])).stdout.trim() !== "";
  const findings: WindowRehearsalExpectedFinding[] = [];
  for (const branch of [...new Set([...local.keys(), ...origin.keys()])].sort()) {
    const missingFromRecord = !Object.hasOwn(record.branches.local, branch) && !Object.hasOwn(record.branches.origin, branch);
    if (branch === "main" || branch === record.flip.branch || !missingFromRecord) continue;
    if (!await tracks(repo, local.get(branch)) && !await tracks(mirror, origin.get(branch))) continue;
    for (const [side, tips] of [["local", local], ["origin", origin]] as const) {
      if (tips.has(branch)) findings.push({ subject: `${side}/${branch}`, condition: "has no comparison mark" });
    }
  }
  return findings;
}

/** The `close` finding for each copied checkout that still tracks state, as every checkout does before it takes the flip. */
export async function trackingCheckouts(context: WindowRehearsalContext): Promise<WindowRehearsalExpectedFinding[]> {
  return (await readWindowCheckouts({ repo: context.layout.repo, exec: context.exec })).filter(row => row.folderPresent)
    .map(row => ({ subject: row.path, condition: "still tracks state paths" }));
}
