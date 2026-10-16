/**
 * CLI adapter for dependent-owned current work-unit reconciliation.
 *
 * @module
 */

import type { Store } from "../lib/store/contract.js";
import type { StoreRefusal, Remedy } from "../lib/store/refusal.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import { readWorkUnit, usesOffBranchState, workUnitMetaPath } from "../lib/store/lifecycle-write.js";
import { sameOwner } from "../lib/store/identity.js";
import type { StoreRecord } from "../lib/store/read.js";
import { readWorktreeMarker } from "../lib/git/worktree-marker.js";
import { buildStoreCurrentWuReconcile } from "../lib/work-unit/store-current-wu-reconcile.js";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as p from "../lib/terminal.js";
import { z } from "zod";

import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { createRawGitExec, createUserIOContext } from "../lib/io-context.js";
import { captureGitIndexState, getCurrentBranch, type GitExec } from "../lib/git/exec.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { branchToWorkUnitSlug } from "../lib/work-unit/work-unit-slug.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
} from "../lib/work-unit/git-transition-record-enumeration.js";
import { listCurrentWuArtifactPaths } from "../lib/work-unit/reference-reconcile.js";
import {
  runCurrentWuReconcile,
  type CurrentWuReconcileResult,
} from "../lib/work-unit/side-effects/discharge-dep-edges.js";
import { parseMetaRecord } from "../lib/active/meta-reader.js";
import { requireArcProjectRoot } from "./shared.js";

/** CLI options for `arc wu reconcile`. */
export interface WuReconcileOptions {
  apply?: boolean;
  json?: boolean;
}

/** Syntax-owned input for current work-unit reconciliation. */
export const WuReconcileCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  apply: z.boolean().optional(),
  json: z.boolean().optional(),
}).strict();

/** Registry contribution owned by current work-unit reconciliation. */
export const wuReconcileCommandInputRegistration = {
  commandPath: "wu reconcile",
  schema: WuReconcileCommandInputSchema,
  schemaFields: {
    "operand.slug": "slug",
    "option.apply": "apply",
    "option.json": "json",
  },
} satisfies CommandInputRegistration;

/** Machine-output policy owned by current work-unit reconciliation. */
export const wuReconcileCommandInputPolicyDeclarations = [{
  commandPath: "wu reconcile",
  aliases: [],
  sites: [
    declareCliOptionSite("json", {
      acquisition: "machine-mode",
      schemaOwnership: "owned",
      schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection",
      subprocess: "none",
    }),
  ],
}] satisfies readonly CommandInputDeclaration[];

interface ReconcileEnvelope {
  schemaVersion: 1;
  status: CurrentWuReconcileResult["status"];
  slug: string;
  dependency: CurrentWuReconcileResult["prepared"]["plan"]["dependency"];
  trackedReferences: CurrentWuReconcileResult["prepared"]["plan"]["trackedReferences"];
  advisories: CurrentWuReconcileResult["prepared"]["plan"]["advisories"];
  edits: ReadonlyArray<{ path: string; expectedContentDigest: string }>;
  stagedPaths: readonly string[];
  reason?: string;
  refusal?: StoreRefusal;
  remedy?: Remedy;
}

/** Run `arc wu reconcile [slug]` from the current work unit's own checkout. */
export async function handleWuReconcile(
  slugArg: string | undefined,
  opts: WuReconcileOptions,
  context?: InteractionContext,
): Promise<void> {
  const parsed = WuReconcileCommandInputSchema.safeParse({
    slug: slugArg?.trim() || undefined,
    ...opts,
  });
  if (!parsed.success) {
    process.stderr.write(`${z.prettifyError(parsed.error)}\n`);
    process.exitCode = 1;
    return;
  }
  const input = parsed.data;
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const io = createUserIOContext(context?.subprocess);
  const exec: GitExec = (cmd, args, options) => io.exec(cmd, args, { cwd, ...options });
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (usesOffBranchState(store)) { await handleStoreReconcile(store, cwd, input); return; }
  const transitionExec = createRawGitExec(cwd);
  const [index, currentBranch] = await Promise.all([
    buildLifecycleIndex({ cwd, fs: nodeLifecycleFs }),
    getCurrentBranch(exec),
  ]);
  if (currentBranch === null) {
    emitConflict(input, input.slug ?? "", "current checkout has no branch identity");
    return;
  }
  const target = await resolveOwnedTarget(cwd, index, currentBranch, input.slug);
  if ("reason" in target) {
    emitConflict(input, target.slug, target.reason);
    return;
  }
  const result = await runCurrentWuReconcile({
    index,
    queryDisposition: (input) => queryGitTransitionDisposition(transitionExec, "HEAD", input),
    enumerateTransitionRecords: () => enumerateGitTransitionRecords(transitionExec, "HEAD"),
    listArtifactPaths: (slug, metaPath) =>
      listCurrentWuArtifactPaths(slug, metaPath, (path) => readdir(resolve(cwd, path))),
    readFile: (path) => io.readFile(resolve(cwd, path)),
    writeFile: (path, content) => io.writeFile(resolve(cwd, path), content),
    stagePaths: async (paths, indexFile) => {
      if (paths.length > 0) await exec("git", ["add", "--", ...paths], { indexFile });
    },
    captureIndexState: () => captureGitIndexState(exec, cwd),
  }, {
    slug: target.slug,
    metaPath: target.metaPath,
    apply: input.apply === true,
  });
  const envelope = toEnvelope(result);
  if (input.json === true) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    emitHuman(envelope);
  }
  if (result.status === "conflict") process.exitCode = 1;
}


/** Run current-work-unit reconciliation with the caller's already-bound operational store. */
export async function handleStoreReconcile(store: Store, cwd: string, input: z.infer<typeof WuReconcileCommandInputSchema>): Promise<void> {
  const current = await resolveCurrentWorkUnit({ cwd, store });
  const slug = await storeReconcileSlug(current, cwd);
  if (slug === undefined) {
    emitConflict(input, input.slug ?? "", current.warnings.join("; ") || "The checkout does not hold exactly one matching work unit.");
    return;
  }
  const meta = await readWorkUnit(store, slug);
  if (meta.status === "refused") { emitConflict(input, slug, `${meta.refusal.condition} ${meta.refusal.remedy.text}`); return; }
  const operandConflict = await requestedReconcileConflict(store, meta.result, input.slug);
  if (operandConflict !== undefined) { emitConflict(input, input.slug ?? slug, operandConflict); return; }
  const ceremony = buildStoreCurrentWuReconcile(store);
  try {
    const prepared = await ceremony.prepare({ slug, metaPath: workUnitMetaPath(meta.result) });
    const result = input.apply === true && prepared.status !== "conflict" ? await ceremony.apply(prepared.prepared) : prepared;
    const envelope = toEnvelope(result);
    if (input.json === true) process.stdout.write(`${JSON.stringify(envelope)}\n`);
    else emitHuman(envelope);
    if (result.status === "conflict") process.exitCode = 1;
  } catch (error) { emitConflict(input, slug, error instanceof Error ? error.message : String(error)); }
}

async function requestedReconcileConflict(store: Store, primary: StoreRecord, requested?: string): Promise<string | undefined> {
  if (requested === undefined || requested === primary.reference.owner.name) return undefined;
  const read = await readWorkUnit(store, requested);
  if (read.status === "refused") return `${read.refusal.condition} ${read.refusal.remedy.text}`;
  return sameOwner(read.result.reference.owner, primary.reference.owner)
    ? undefined : "The requested work unit does not match the checkout's work-unit identity.";
}

async function resolveOwnedTarget(
  cwd: string,
  index: Awaited<ReturnType<typeof buildLifecycleIndex>>,
  currentBranch: string,
  slugArg: string | undefined,
): Promise<{ slug: string; metaPath: string } | { slug: string; reason: string }> {
  const matches: Array<{ slug: string; metaPath: string }> = [];
  for (const entry of index.values()) {
    let branch: string | null;
    try {
      branch = parseMetaRecord(await readFile(resolve(cwd, entry.path), "utf8")).branch;
    } catch {
      continue;
    }
    if (branch === currentBranch) matches.push({ slug: entry.slug, metaPath: entry.path });
  }
  const requested = slugArg?.trim();
  if (requested !== undefined && requested !== "") {
    const match = matches.find((candidate) => candidate.slug === requested);
    if (match !== undefined) return match;
    const archived = index.get(requested);
    if (
      branchToWorkUnitSlug(currentBranch) === requested
      && archived?.phase === "Shipped"
      && archived.location === "completed"
    ) {
      return { slug: requested, metaPath: archived.path };
    }
    return {
      slug: requested,
      reason: `work unit \`${requested}\` is not owned by branch \`${currentBranch}\``,
    };
  }
  const [only] = matches;
  return matches.length === 1 && only !== undefined
    ? only
    : {
        slug: "",
        reason: matches.length === 0
          ? `branch \`${currentBranch}\` owns no work unit`
          : `branch \`${currentBranch}\` owns multiple work units; pass an explicit slug`,
      };
}

function toEnvelope(result: CurrentWuReconcileResult): ReconcileEnvelope {
  return {
    schemaVersion: 1,
    status: result.status,
    slug: result.prepared.slug,
    dependency: result.prepared.plan.dependency,
    trackedReferences: result.prepared.plan.trackedReferences,
    advisories: result.prepared.plan.advisories,
    edits: result.prepared.edits.map(({ path, expectedContentDigest }) => ({
      path,
      expectedContentDigest,
    })),
    stagedPaths: result.status === "applied" ? result.stagedPaths : [],
    ...(result.status === "conflict" ? { reason: result.reason,
      ...(result.refusal === undefined ? {} : { refusal: result.refusal }),
      ...(result.remedy === undefined ? {} : { remedy: result.remedy }) } : {}),
  };
}

function emitConflict(opts: WuReconcileOptions, slug: string, reason: string): void {
  const envelope = {
    schemaVersion: 1,
    status: "conflict",
    slug,
    reason,
    dependency: null,
    trackedReferences: { edits: [] },
    advisories: [],
    edits: [],
    stagedPaths: [],
  };
  if (opts.json === true) process.stdout.write(`${JSON.stringify(envelope)}\n`);
  else p.log.error(reason);
  process.exitCode = 1;
}

function emitHuman(envelope: ReconcileEnvelope): void {
  if (envelope.status === "clean") {
    p.log.success(`Work unit \`${envelope.slug}\` has no pending reconcile.`);
    return;
  }
  if (envelope.status === "conflict") {
    p.log.error(`Work unit \`${envelope.slug}\` reconcile refused: ${envelope.reason ?? "conflict"}.`);
    const remedy = envelope.remedy ?? envelope.refusal?.remedy;
    if (remedy !== undefined) p.log.info(`${remedy.text}${remedy.argv === undefined ? "" : ` ${remedy.argv.map((part) => JSON.stringify(part)).join(" ")}`}`);
    return;
  }
  const action = envelope.status === "applied" ? "Applied" : "Pending";
  p.log.info(
    `${action} reconcile for \`${envelope.slug}\`: dependency `
    + `${envelope.dependency.before.join(", ") || "[none]"} → `
    + `${envelope.dependency.after.join(", ") || "[none]"}; `
    + `${envelope.trackedReferences.edits.length} tracked reference edit(s); `
    + `${envelope.advisories.length} advisory finding(s).`,
  );
}

const nodeLifecycleFs: LifecycleIndexFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

async function storeReconcileSlug(current: Awaited<ReturnType<typeof resolveCurrentWorkUnit>>, cwd: string): Promise<string | undefined> {
  let slug = current.status === "resolved" ? current.candidate.reference.owner.name : undefined;
  if (slug === undefined && current.status === "none") {
    const marker = await readWorktreeMarker(cwd);
    if (marker.kind === "present" && marker.marker.createdFor?.kind === "work-unit") slug = SlugSchema.parse(marker.marker.createdFor.name);
  }
  return slug;
}
