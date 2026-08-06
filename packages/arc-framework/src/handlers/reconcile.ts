/**
 * CLI adapter for dependent-owned current work-unit reconciliation.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as p from "@clack/prompts";
import { z } from "zod";

import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { createUserIOContext } from "../lib/io-context.js";
import { captureGitIndexState, getCurrentBranch, type GitExec } from "../lib/git/exec.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { branchToWorkUnitSlug } from "../lib/work-unit/completed-index.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
  transitionRecordGitExec,
} from "../lib/work-unit/git-transition-record-enumeration.js";
import { listCurrentWuArtifactPaths } from "../lib/work-unit/reference-reconcile.js";
import {
  runCurrentWuReconcile,
  type CurrentWuReconcileResult,
} from "../lib/work-unit/side-effects/discharge-dep-edges.js";
import { parseMetaRecord } from "../lib/active/meta-reader.js";
import {
  createNodeWorkUnitLocusDriver,
  type WorkUnitLocusDriver,
  type WorkUnitLocusReceipt,
} from "../lib/work-unit/work-unit-locus.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";

/** CLI options for `arc wu reconcile`. */
export interface WuReconcileOptions {
  apply?: boolean;
  attachSession?: boolean;
  json?: boolean;
}

/** Syntax-owned input for current work-unit reconciliation. */
export const WuReconcileCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  apply: z.boolean().optional(),
  attachSession: z.boolean().optional(),
  json: z.boolean().optional(),
}).strict();

/** Registry contribution owned by current work-unit reconciliation. */
export const wuReconcileCommandInputRegistration = {
  commandPath: "wu reconcile",
  schema: WuReconcileCommandInputSchema,
  schemaFields: {
    "operand.slug": "slug",
    "option.apply": "apply",
    "option.attachSession": "attachSession",
    "option.json": "json",
  },
} satisfies CommandInputRegistration;

/** Machine-output policy owned by current work-unit reconciliation. */
export const wuReconcileCommandInputPolicyDeclarations = [{
  commandPath: "wu reconcile",
  aliases: [],
  sites: [
    declareCliOptionSite("attach-session", {
      acquisition: "optional",
      schemaOwnership: "owned",
      schemaField: "attachSession",
      cancellation: "not-applicable",
      automation: { noInput: "preserve-absent", flags: ["--attach-session"], acceptedSyntax: [] },
      mutationBoundary: "current work-unit session entry",
      subprocess: "none",
    }),
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
  let locusReceipt: WorkUnitLocusReceipt | null = null;
  if (input.apply === true || input.attachSession === true) {
    const identity = await resolveIdentityWithPrompt(false);
    if (identity === null) {
      emitConflict(input, target.slug, "cannot reconcile the work-unit locus: identity resolution failed");
      return;
    }
    try {
      locusReceipt = await createNodeWorkUnitLocusDriver({ exec, identity }).reconcile({
        checkoutPath: cwd,
        branch: currentBranch,
        wuName: target.slug,
        attachSession: input.attachSession === true,
      });
    } catch (error) {
      emitConflict(input, target.slug, error instanceof Error ? error.message : String(error));
      return;
    }
  }

  const result = await runCurrentWuReconcile({
    index,
    queryDisposition: (input) => queryGitTransitionDisposition(transitionRecordGitExec(exec), "HEAD", input),
    enumerateTransitionRecords: () => enumerateGitTransitionRecords(transitionRecordGitExec(exec), "HEAD"),
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
  const envelope = toEnvelope(result, locusReceipt?.roleCreated === true);
  if (input.json === true) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    emitHuman(envelope);
  }
  if (result.status === "conflict") process.exitCode = 1;
}

/** Attach the invoking session after a work-unit entry's physical checkout has landed. */
export function attachCurrentWuSession(
  driver: WorkUnitLocusDriver,
  options: { checkoutPath: string; branch: string; wuName: string },
): Promise<WorkUnitLocusReceipt> {
  return driver.reconcile({ ...options, attachSession: true });
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

function toEnvelope(result: CurrentWuReconcileResult, roleCreated: boolean): ReconcileEnvelope {
  return {
    schemaVersion: 1,
    status: roleCreated && result.status === "clean" ? "applied" : result.status,
    slug: result.prepared.slug,
    dependency: result.prepared.plan.dependency,
    trackedReferences: result.prepared.plan.trackedReferences,
    advisories: result.prepared.plan.advisories,
    edits: result.prepared.edits.map(({ path, expectedContentDigest }) => ({
      path,
      expectedContentDigest,
    })),
    stagedPaths: result.status === "applied" ? result.stagedPaths : [],
    ...(result.status === "conflict" ? { reason: result.reason } : {}),
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
