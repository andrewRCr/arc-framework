/** Resolve the clone's first state designation without prompting or moving held state. */

import { observeRefLayout, layoutRecoveryRemedy } from "./layout-state.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { codeHoldsState, readRefRepository, writeRefRepository } from "./repository.js";
import { checkRefDesignationProject, type RefDesignationProjectCheck } from "./designation-project.js";
import { readRefRegistryPresence, type RefRegistryPresence } from "./designation-presence.js";
import type { PullOutcome, SyncState } from "../sync.js";

/** Configuration questions and candidate failures prevent state publication independently. */
export interface RefDesignationResolution {
  designation: RefDesignation;
  states: SyncState[];
  pulls: PullOutcome[];
}

/** Read existing roles first; only an unanswered first designation consults the tracked pointer. */
export async function resolveRefDesignation(context: RefBackendContext): Promise<RefDesignationResolution> {
  const designation = await readRefDesignation(context);
  const layout = await observeRefLayout(context, designation), configured = refDesignationStop(designation);
  const configuredStop = configured && configured.status !== "no-remote" ? configured : undefined;
  const stop = configuredStop ?? layout.incomplete;
  if (stop) return { designation, states: [stop.status === "move-incomplete" ? { ...stop, remedy: layoutRecoveryRemedy() } : stop,
    ...layout.unfinished ? [layout.unfinished] : []], pulls: [] };
  const resolved = await resolveFirstDesignation(context, designation);
  return { ...resolved, states: [...resolved.states, ...layout.unfinished ? [layout.unfinished] : []] };
}

async function resolveFirstDesignation(context: RefBackendContext, initial: RefDesignation): Promise<RefDesignationResolution> {
  let designation = initial;
  const result: RefDesignationResolution = { designation, states: [], pulls: [] };
  if (!designation.backing && designation.remotes.every(({ role }) => role === undefined)) {
    const state = await installFirstBacking(context);
    if (state) return { ...result, states: [state] };
    designation = await readRefDesignation(context);
    result.designation = designation;
  }
  const candidates = designation.backing ? [designation.backing] : designation.remotes;
  const unanswered = candidates.filter(({ role }) => role === undefined);
  if (designation.backing && unanswered[0]) return { ...result, states: [designationQuestion(unanswered[0], designation)] };
  // A designated push remote already publishes this clone's state, so no first designation is due and nothing is probed.
  if (!unanswered.length || designation.pushes.length) return { ...result, states: designation.pushes.length ? [] : [{ status: "no-remote" }] };
  const observed = await registryPresence(context, unanswered, designation);
  if (observed.status === "failed") return { ...result, pulls: [observed] };
  return decideDesignation(context, result, unanswered, observed.present);
}

async function installFirstBacking(context: RefBackendContext): Promise<SyncState | null> {
  const pointer = await context.backingRepository();
  if (!pointer) return null;
  const physical = await readRefRepository(context);
  if (!physical.repository?.gitDir && await codeHoldsState(physical)) return heldBeforeBacking();
  await writeRefRepository(context);
  const release = await context.lock("layout");
  try {
    // Another checkout may have designated a remote or placed state in the code repository since the store was placed.
    const current = await readRefDesignation(context);
    if (current.backing || current.pushes.length) return null;
    const selected = await readRefRepository(context);
    if (!selected.repository?.gitDir) return heldBeforeBacking();
    await selected.exec("git", ["remote", "add", "backing", pointer]);
  } finally { await release(); }
  return null;
}

function heldBeforeBacking(): SyncState {
  return { status: "move-incomplete", condition: "The tracked backing pointer needs a separate store, but state remains in the code repository.",
    remedy: layoutRecoveryRemedy() };
}

async function registryPresence(context: RefBackendContext, candidates: RefRemoteDesignation[], designation: RefDesignation):
Promise<{ status: "ok"; present: Set<string> } | Extract<PullOutcome, { status: "failed" }>> {
  const present = new Set<string>();
  for (const remote of candidates) {
    const observed = await readRefRegistryPresence(context, remote.name);
    if (observed.status === "unreachable") {
      const question = designationQuestion(remote, designation);
      return failedPresence(remote, observed, `Repair the remote and retry the pull, or designate it by hand. ${question.remedy.text}`, question);
    }
    if (observed.present) present.add(remote.name);
  }
  return { status: "ok", present };
}

async function decideDesignation(context: RefBackendContext, result: RefDesignationResolution,
  unanswered: RefRemoteDesignation[], present: ReadonlySet<string>): Promise<RefDesignationResolution> {
  const { designation } = result;
  const upstream = unanswered.find((remote) => remote.name !== designation.codeRemote && present.has(remote.name));
  if (upstream) return { ...result, states: [designationQuestion(upstream, designation)] };
  const code = unanswered.find(({ name }) => name === designation.codeRemote);
  if (code) {
    const physical = await readRefRepository(context);
    if (present.has(code.name) && present.size === 1 && !physical.repository?.gitDir
      && designation.remotes.every(({ role }) => role === undefined)) {
      const check = await checkRefDesignationProject(context, code, designation);
      if (check.status !== "ok") return { ...result, pulls: [automaticProjectFailure(code.name, check)] };
      const source = context.repository?.source ?? context;
      await source.exec("git", ["config", `remote.${code.name}.arc-state`, "push"]);
      return { ...result, designation: await readRefDesignation(context) };
    }
    const question = designationQuestion(code, designation);
    if (present.has(code.name)) return { ...result, states: [question] };
    const answered = await answeredRegistry(context, designation, question);
    if (answered === "none") return { ...result, states: [question] };
    if (answered !== "held") return { ...result, pulls: answered };
  }
  return { ...result, states: [{ status: "no-remote" }] };
}

/**
 * An answered remote holding the registry, or a read source whose presence read fails, leaves the code remote unasked
 * wherever it sits. A read source's failure surfaces in its own fetch; an `off` remote is never fetched, so where no
 * answered remote settles the question, each `off` remote whose read fails is reported here.
 */
async function answeredRegistry(context: RefBackendContext, designation: RefDesignation,
  code: ReturnType<typeof designationQuestion>): Promise<"held" | "none" | Extract<PullOutcome, { status: "failed" }>[]> {
  const failed: Extract<PullOutcome, { status: "failed" }>[] = [];
  for (const remote of designation.remotes) {
    if (remote.role === undefined) continue;
    const observed = await readRefRegistryPresence(context, remote.name);
    if (observed.status === "unreachable" && remote.role === "off") {
      failed.push(failedPresence(remote, observed, `Repair or remove ${remote.name} and retry the pull, or designate the code remote by hand. ${code.remedy.text}`, code));
    } else if (observed.status === "unreachable" || observed.present) return "held";
  }
  return failed.length ? failed : "none";
}

function failedPresence(remote: RefRemoteDesignation, observed: Extract<RefRegistryPresence, { status: "unreachable" }>,
  text: string, question: ReturnType<typeof designationQuestion>): Extract<PullOutcome, { status: "failed" }> {
  return { status: "failed", role: "candidate", remote: remote.name, families: ["project-registry"], notices: [],
    failure: { code: "unreachable", class: "recoverable", cause: observed.cause, condition: observed.condition, remedy: { text, argv: question.remedy.argv } } };
}

function designationQuestion(remote: RefRemoteDesignation, designation: RefDesignation): Extract<SyncState, { status: "designation-needed" }> {
  const own = remote.repository === "backing" || remote.name === designation.codeRemote;
  const choices = own ? ["push", "off"] as const : ["push", "read", "off"] as const;
  return { status: "designation-needed", remote: remote.name, choices: [...choices], remedy: {
    text: `Choose ${choices.join(", ")} for ${remote.name} with arc store remote ${remote.name} <role>.`,
    argv: ["arc", "store", "remote", remote.name, own ? "push" : "read"],
  } };
}

function automaticProjectFailure(remote: string, check: Exclude<RefDesignationProjectCheck, { status: "ok" }>): PullOutcome {
  if (check.status === "control-refused") return { remote, role: "candidate", families: ["project-registry"], notices: [], status: "failed",
    failure: { code: "refused", class: "terminal", message: check.refusal.condition, condition: check.refusal.condition,
      remedy: check.refusal.code === "moved" ? { text: `Run arc store remote ${remote} off to stop this designation, or arc store remote ${remote} read and then arc store migrate to follow after bringing in the tracked pointer's change.`,
        argv: ["arc", "store", "remote", remote, "off"] } : check.refusal.remedy } };
  const condition = check.status === "identity-mismatch"
    ? `Remote ${remote} belongs to project ${check.remote}; this store belongs to ${check.local}.` : "";
  return { remote, role: "candidate", families: ["project-registry"], notices: [], status: "failed",
    failure: check.status === "failed" ? check.failure : { code: "refused", class: "terminal", message: condition, condition,
      remedy: { text: `Set ${remote} off and choose the repository for this project before retrying.`,
        argv: ["arc", "store", "remote", remote, "off"] } } };
}
