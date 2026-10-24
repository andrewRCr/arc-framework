/** Judge a follow against the departed remote's fresh record and isolated candidate registries. */
import type { StoreCommandRefusal, StoreDesignationQuestion, StoreMigrateResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RefFollowDue } from "./follow-due.js";
import { migrationCodeContext, type MoveRemote } from "./migrate-record.js";
import { captureMoveRemote } from "./migrate-remote-target.js";
import { clearMigrationRefs, fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { FORWARDING_REF, readForwardingRecord, type ForwardingRecord } from "./forwarding-record.js";
import { readRefRegistryPresence } from "./designation-presence.js";
import { readRefRepository } from "./repository.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import { isCompletedGitFailure, isGitProcessError, gitFailureText } from "../../git/process-error.js";
import { classifyRemoteFailure } from "../../git/remote-ref-reader.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { readBatchObjects } from "./batch-read.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { fetchLayoutObjects } from "./migrate-layout-build.js";

/** A registry observation belonging to one exact candidate. */
export interface RefFollowCandidate { remote: MoveRemote; registry: string }
/** Keep accepted candidates available to an explicit answer even when several prevent an automatic question. */
export type RefFollowJudgment = { status: "none" }
  | { status: "refused"; refusal: StoreCommandRefusal }
  | { status: "decided"; source: MoveRemote; record: ForwardingRecord; forwardingTip: string; accepted: RefFollowCandidate[]; result: StoreMigrateResult };

/** No designation, pointer, stored record, or remote state changes while candidates are judged. */
export async function judgeRefFollow(context: RefBackendContext, due: RefFollowDue): Promise<RefFollowJudgment> {
  const code = await migrationCodeContext(context);
  let readingSource = false;
  try {
    const source = await readFollowRemote(due.remote.name, () => captureMoveRemote(context, code, due.remote));
    readingSource = true;
    const refs = await readFollowRemote(source.name, () => fetchMigrationRemote(code, source, false, { prefix: "refs/arc/tmp/follow/source/", controls: ["moved"] }));
    readingSource = false;
    const forwarding = await readFollowRemote(source.name, () => readForwardingRecord(code, refs.get(FORWARDING_REF), source.name));
    if (forwarding.status === "refused") return forwarding;
    if (!forwarding.result) { await dropStaleFollow(context, due); return { status: "none" }; }
    const record = forwarding.result, forwardingTip = refs.get(FORWARDING_REF);
    if (!forwardingTip) throw new Error("A parsed forwarding record has no fetched tip");
    const candidates = await followCandidates(context, code, due);
    const accepted: RefFollowCandidate[] = [], rejected: string[] = [];
    for (const remote of candidates) {
      const judged = await readFollowRemote(remote.name, () => judgeCandidate(code, remote, record));
      if (judged.accepted) accepted.push({ remote, registry: judged.registry });
      else rejected.push(`${remote.name} (${remote.fetchUrl}): ${judged.reason}`);
    }
    return { status: "decided", source, record, forwardingTip, accepted, result: followResult(due, accepted, rejected) };
  } catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    if (readingSource && error.refusal.code === "store" && error.refusal.refusal.code === "unreachable") {
      return { status: "refused", refusal: await departedSourceRemedy(context, code, due, error.refusal) };
    }
    return { status: "refused", refusal: error.refusal };
  } finally { await clearMigrationRefs(code, "refs/arc/tmp/follow/"); }
}

async function followCandidates(context: RefBackendContext, code: RefBackendContext, due: RefFollowDue, exclude?: string): Promise<MoveRemote[]> {
  const pointer = await context.backingRepository();
  if (pointer) return [{ name: "backing", repository: "backing", url: pointer, fetchUrl: pointer, pushUrl: pointer }];
  const candidates: MoveRemote[] = [];
  for (const remote of due.designation.codeRemotes) {
    if (remote.name === exclude || remote.name === "backing") continue;
    const captured = await readFollowRemote(remote.name, () => captureMoveRemote(context, code, remote));
    const presence = await readRefRegistryPresence(code, captured.fetchUrl);
    if (presence.status === "unreachable") throw followReadFailure(remote.name, presence.condition, presence.cause);
    if (presence.present) candidates.push(captured);
  }
  return candidates;
}

async function departedSourceRemedy(context: RefBackendContext, code: RefBackendContext, due: RefFollowDue,
  failure: Extract<StoreCommandRefusal, { code: "store" }>): Promise<StoreCommandRefusal> {
  const off = `arc store remote ${due.remote.name} off`;
  if (due.remote.repository === "code" && due.remote.role === "read") return { ...failure,
    refusal: { ...failure.refusal, remedy: { text: `Stop fetching the deleted read source with ${off}, then designate the remote the state moved to.` } } };
  const destinations: MoveRemote[] = [];
  try {
    const physical = await readRefRepository(context);
    await fetchLayoutObjects(code, physical.repository?.gitDir ?? physical.repository?.commonDir ?? "", new Map([[FORWARDING_REF, due.tip]]));
    const cached = await readForwardingRecord(code, due.tip, due.remote.name);
    if (cached.status === "ok" && cached.result) {
      for (const candidate of await followCandidates(context, code, due, due.remote.name)) {
        const record = cached.result;
        if ((await readFollowRemote(candidate.name, () => judgeCandidate(code, candidate, record))).accepted) destinations.push(candidate);
      }
    }
  } catch (error) { if (!(error instanceof MigrationRefusal)) throw error; }
  const targets = destinations.map(remote => remote.repository === "backing" ? remote.url : remote.name);
  const commands = (targets.length ? targets : ["<remote>"]).map(target => `arc store migrate --leave-source --to ${target}`);
  return { ...failure, refusal: { ...failure.refusal, remedy: {
    text: `Repair the old remote and retry arc store migrate, or leave it from this clone's last view with ${commands.join(" or ")}. To publish nothing, use ${off}.`,
    ...(targets.length === 1 ? { argv: ["arc", "store", "migrate", "--leave-source", "--to", targets[0] ?? ""] } : {}),
  } } };
}

async function judgeCandidate(code: RefBackendContext, remote: MoveRemote, record: ForwardingRecord): Promise<
  { accepted: true; registry: string } | { accepted: false; reason: string }> {
  const prefix = remote.repository === "backing" ? "refs/arc/tmp/follow/pointer/" : `refs/arc/tmp/follow/candidate/${remote.name}/`;
  const refs = await fetchMigrationRemote(code, remote, false, { prefix });
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), remote.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result) return { accepted: false, reason: "it carries a forwarding record" };
  const registry = refs.get("refs/arc/project/registry");
  if (!registry) return { accepted: false, reason: "its registry is absent and cannot hold the move's commit" };
  const project = projectOwnerFromObjects(refs, await readBatchObjects(code, projectIdentityQueries(refs)));
  if (project.status === "refused") throw followReadFailure(remote.name, project.refusal.condition);
  const projectId = project.result.type === "project" ? project.result.uid : undefined;
  if (projectId !== record.projectId) return { accepted: false, reason: `it names project ${projectId ?? "without an identity"}, not ${record.projectId}` };
  if (!await holdsFollowCommit(code, record.registryCommit, registry)) return { accepted: false, reason: `its registry lacks the move's commit ${record.registryCommit}` };
  return { accepted: true, registry };
}

async function holdsFollowCommit(code: RefBackendContext, move: string, registry: string): Promise<boolean> {
  try { await code.exec("git", ["cat-file", "-e", move], { cwd: code.checkoutRoot, objectAccess: "local-only" }); }
  catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return false;
    throw error;
  }
  return syncRefIsAncestor(code, move, registry);
}

function followResult(due: RefFollowDue, accepted: RefFollowCandidate[], rejected: string[]): StoreMigrateResult {
  if (accepted.length > 1) return { status: "refused", refusal: { code: "follow-refused", class: "recoverable",
    condition: `Several remotes hold the move: ${accepted.map(row => row.remote.name).join(", ")}.`,
    remedy: { text: `Choose the state's home with ${accepted.map(row => `arc store remote ${row.remote.name} <push|read|off>`).join(" or ")}.` } } };
  if (!accepted.length) return { status: "refused", refusal: { code: "follow-refused", class: "recoverable",
    condition: `No remote holds the move. ${rejected.join("; ") || "No code repository remote carries a registry."}`,
    remedy: { text: "Bring in the code carrying the tracked pointer's change, or add the upstream remote the state moved to, then retry arc store migrate.", argv: ["arc", "store", "migrate"] } } };
  const candidate = accepted[0];
  if (!candidate) throw new Error("A single accepted follow candidate is absent");
  const conflict = backingPublicationConflict(due, candidate);
  if (conflict) return conflict;
  const recommended = due.remote.role === "read" ? "read" : "push";
  const question: StoreDesignationQuestion = { status: "designation-needed", remote: candidate.remote.name, choices: ["push", "read", "off"],
    remedy: { text: `Choose push, read, or off for ${candidate.remote.name} with arc store remote ${candidate.remote.name} <role>.`,
      argv: ["arc", "store", "remote", candidate.remote.name, recommended] } };
  return question;
}

function backingPublicationConflict(due: RefFollowDue, candidate: RefFollowCandidate): Extract<StoreMigrateResult, { status: "refused" }> | null {
  const own = due.designation.pushes.find(remote => remote.repository === "code" && remote.name !== due.remote.name);
  if (candidate.remote.repository !== "backing" || !own) return null;
  return { status: "refused", refusal: { code: "follow-refused", class: "recoverable",
    condition: `This clone publishes its own project state on ${own.name}; the moved project's backing repository must remain a read source.`,
    remedy: { text: `Turn ${due.remote.name} off, add another code remote for ${candidate.remote.fetchUrl}, then designate that remote read with arc store remote <name> read.`,
      argv: ["arc", "store", "remote", due.remote.name, "off"] } } };
}

/** Clear only the tracking observation proved obsolete by a successful fresh source read. */
export async function dropStaleFollow(context: RefBackendContext, due: Pick<RefFollowDue, "trackingRef" | "tip">): Promise<void> {
  const physical = await readRefRepository(context);
  const dropped = await updateRefTransaction(physical, [{ ref: due.trackingRef, delete: true, expected: due.tip }], { cwd: physical.checkoutRoot });
  if (dropped.status !== "committed") throw new MigrationRefusal({ code: "follow-refused", class: "recoverable",
    condition: "The departed remote's tracking record changed while the stale follow was being cleared.",
    remedy: { text: "Retry arc store migrate to judge the current record.", argv: ["arc", "store", "migrate"] } });
}

/** Convert follow acquisition failures to the remote-naming, repairable store refusal. */
export async function readFollowRemote<T>(remote: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof MigrationRefusal && error.refusal.code === "store") throw followReadFailure(remote, error.message,
      error.refusal.refusal.code === "unreachable" ? error.refusal.refusal.cause : "error");
    if (isGitProcessError(error)) throw followReadFailure(remote, gitFailureText(error), classifyRemoteFailure(error));
    throw error;
  }
}

function followReadFailure(remote: string, condition: string, cause: "timeout" | "network" | "auth" | "error" = "error"): MigrationRefusal {
  return new MigrationRefusal({ code: "store", refusal: { code: "unreachable", class: "recoverable", cause,
    condition: `Could not read follow remote ${remote}: ${condition}`,
    remedy: { text: `Repair ${remote} and retry arc store migrate, or turn the departed remote off with arc store remote <remote> off.` } } });
}
