/** A repository-local restore record and its reachability hold outside the store namespace. */
import { z } from "zod";
import { listWindowRefs, type WindowGitReadIO } from "./git.js";
import type { GitExecInput } from "../../lib/git/exec.js";
import { WindowRefusal } from "./result.js";
import { updateRefTransaction, type RefChange } from "../../lib/git/ref-transaction.js";
import { refFetchArgs } from "../../lib/store/ref/fetch-target.js";
import { hashBlob, writeTreeCommit } from "../../lib/git/ref-tree.js";

const oid = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const names = z.string().min(1).regex(/^[^\s\0]+$/u);
const branchTips = z.record(names, oid);
const refTips = (prefix: string) => z.record(names.startsWith(prefix), oid);
const recordSchema = z.strictObject({
  version: z.literal(1),
  flip: z.strictObject({ branch: names, pullRequest: z.number().int().positive(), head: oid }),
  worktrees: z.array(z.strictObject({ path: z.string().min(1), head: oid, branch: names.nullable() })),
  branches: z.strictObject({ local: branchTips, origin: branchTips }),
  refs: z.strictObject({ local: refTips("refs/arc/"), origin: refTips("refs/arc/"), tracking: refTips("refs/arc-remotes/origin/") }),
});

/** Git boundaries pinned to the operation's explicit checkout. */
export interface WindowHoldIO extends WindowGitReadIO { execInput: GitExecInput }
/** The immutable input snapshot retained by the cutover hold. */
export type WindowRecord = z.infer<typeof recordSchema>;

function boundIO(io: WindowHoldIO): WindowHoldIO {
  return { repo: io.repo,
    exec: (command, args, options) => io.exec(command, args, { ...options, cwd: io.repo }),
    execInput: (args, input, options) => io.execInput(args, input, { ...options, cwd: io.repo }),
  };
}

/** Write one complete hold, returning the record commit. */
export async function writeWindowHold(io: WindowHoldIO, record: WindowRecord): Promise<string> {
  const bound = boundIO(io);
  const checked = recordSchema.parse(record);
  const remote = Object.entries(checked.refs.origin);
  if (remote.length > 0) {
    await bound.execInput(refFetchArgs("origin", [], "origin"),
      remote.map(([ref, tip]) => `${tip}:refs/arc-window/origin/${ref}\n`).join(""),
      { signal: AbortSignal.timeout(30_000) });
  }
  const changes: RefChange[] = [];
  for (const side of ["local", "tracking"] as const) {
    for (const [ref, tip] of Object.entries(checked.refs[side])) {
      changes.push({ ref: `refs/arc-window/${side}/${ref}`, next: tip, expected: null });
    }
  }
  if (changes.length > 0) {
    const outcome = await updateRefTransaction(bound, changes, { cwd: io.repo });
    if (outcome.status !== "committed") throw new WindowRefusal(outcome.refs.map(ref => ({
      subject: ref.ref, condition: "The hold ref already exists.",
      remedy: "Inspect the existing hold; restore a complete window or remove an incomplete hold before retrying check.",
    })));
  }
  const blob = await hashBlob(bound.execInput, JSON.stringify(checked) + "\n");
  const tip = await writeTreeCommit(bound, "refs/arc-window/record", new Map([["window.json", blob]]), "Record cutover window", [], null);
  await bound.exec("git", ["update-ref", "refs/arc-window/complete", tip, ""]);
  return tip;
}

/** Read the complete record shared by subsequent window operations. */
export async function readWindowHold(io: WindowHoldIO): Promise<{ tip: string; record: WindowRecord }> {
  const bound = boundIO(io);
  const held = await listWindowRefs(bound, ["refs/arc-window/"]);
  if (held.size === 0) throw new WindowRefusal([{ subject: "cutover hold", condition: "No cutover hold exists.",
    remedy: "Run check to record a restore point before continuing." }]);
  const complete = held.get("refs/arc-window/complete");
  if (complete === undefined) throw new WindowRefusal([{ subject: "cutover hold", condition: "The cutover hold is incomplete.",
    remedy: "Remove the incomplete hold under refs/arc-window/, then run check again." }]);
  const tip = held.get("refs/arc-window/record");
  if (tip !== complete) throw new WindowRefusal([{ subject: "cutover hold", condition: "The record does not match its completion marker.",
    remedy: "Preserve the held refs, inspect and repair the record binding, then retry." }]);
  const content = (await bound.exec("git", ["--no-replace-objects", "show", `${tip}:window.json`],
    { objectAccess: "local-only" })).stdout;
  return { tip, record: recordSchema.parse(JSON.parse(content)) };
}
