/** Resolve the clone's first state designation without prompting or moving held state. */

import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { readRefRepository, writeRefRepository } from "./repository.js";
import { readRefTips } from "./batch-read.js";
import { isManifestRef } from "./manifest.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import type { PullOutcome, SyncState } from "../sync.js";

/** Configuration questions and candidate failures prevent state publication independently. */
export interface RefDesignationResolution {
  designation: RefDesignation;
  states: SyncState[];
  pulls: PullOutcome[];
}

/** Read existing roles first; only an unanswered first designation consults the tracked pointer. */
export async function resolveRefDesignation(context: RefBackendContext): Promise<RefDesignationResolution> {
  let designation = await readRefDesignation(context);
  const result: RefDesignationResolution = { designation, states: [], pulls: [] };
  const stopped = refDesignationStop(designation);
  if (stopped && stopped.status !== "no-remote") return { ...result, states: [stopped] };
  if (!designation.backing && designation.remotes.every(({ role }) => role === undefined)) {
    const state = await installFirstBacking(context);
    if (state) return { ...result, states: [state] };
    designation = await readRefDesignation(context);
    result.designation = designation;
  }
  const candidates = designation.backing ? [designation.backing] : designation.remotes;
  const unanswered = candidates.filter(({ role }) => role === undefined);
  if (designation.backing && unanswered[0]) return { ...result, states: [designationQuestion(unanswered[0], designation)] };
  if (!unanswered.length) return { ...result, states: designation.pushes.length ? [] : [{ status: "no-remote" }] };
  const present = await registryPresence(context, candidates);
  return decideDesignation(context, result, unanswered, present);
}

async function installFirstBacking(context: RefBackendContext): Promise<SyncState | null> {
  const pointer = await context.backingRepository();
  if (!pointer) return null;
  const physical = await readRefRepository(context);
  if (!physical.repository?.gitDir && await holdsState(physical)) return {
    status: "move-incomplete", condition: "The tracked backing pointer needs a separate store, but state remains in the code repository.",
    remedy: { text: "Move the held state with arc store migrate --to <URL> before designating backing.", argv: ["arc", "store", "migrate", "--to", pointer] },
  };
  const separate = await writeRefRepository(context);
  const release = await context.lock("layout");
  try {
    if (!(await readRefDesignation(context)).backing) await separate.exec("git", ["remote", "add", "backing", pointer]);
  } finally { await release(); }
  return null;
}

async function registryPresence(context: RefBackendContext, candidates: RefRemoteDesignation[]): Promise<Set<string>> {
  const present = new Set<string>();
  for (const remote of candidates) {
    const source = context.repository?.source ?? context;
    const { stdout } = await source.exec("git", ["ls-remote", "--refs", "--", remote.name, "refs/arc/project/registry"],
      { cwd: context.checkoutRoot, interaction: PASSIVE_REMOTE_INTERACTION, diagnosticLocale: "stable" });
    if (stdout.split(/\r?\n/u).some((line) => line.split("\t")[1] === "refs/arc/project/registry")) present.add(remote.name);
  }
  return present;
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
      const source = context.repository?.source ?? context;
      await source.exec("git", ["config", `remote.${code.name}.arc-state`, "push"]);
      return { ...result, designation: await readRefDesignation(context) };
    }
    if (!present.size || present.has(code.name)) return { ...result, states: [designationQuestion(code, designation)] };
  }
  return { ...result, states: designation.pushes.length ? [] : [{ status: "no-remote" }] };
}

async function holdsState(context: RefBackendContext): Promise<boolean> {
  return [...(await readRefTips(context, { includeHistory: true })).keys()]
    .some((ref) => isManifestRef(ref.replace("refs/arc/history/", "refs/arc/")));
}

function designationQuestion(remote: RefRemoteDesignation, designation: RefDesignation): SyncState {
  const own = remote.repository === "backing" || remote.name === designation.codeRemote;
  const choices = own ? ["push", "off"] as const : ["push", "read", "off"] as const;
  return { status: "designation-needed", remote: remote.name, choices: [...choices], remedy: {
    text: `Choose ${choices.join(", ")} for ${remote.name} with arc store remote ${remote.name} <role>.`,
    argv: ["arc", "store", "remote", remote.name, own ? "push" : "read"],
  } };
}
