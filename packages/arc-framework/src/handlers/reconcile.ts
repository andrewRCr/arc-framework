/**
 * CLI adapter for dependent-owned current work-unit reconciliation.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as p from "@clack/prompts";

import { createUserIOContext } from "../lib/io-context.js";
import { getCurrentBranch } from "../lib/git/exec.js";
import { branchToWorkUnitSlug } from "../lib/work-unit/completed-index.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import { queryGitRetirementDisposition } from "../lib/work-unit/git-retirement-record-enumeration.js";
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

interface ReconcileEnvelope {
  schemaVersion: 1;
  status: CurrentWuReconcileResult["status"];
  slug: string;
  dependency: CurrentWuReconcileResult["prepared"]["plan"]["dependency"];
  trackedReferences: CurrentWuReconcileResult["prepared"]["plan"]["trackedReferences"];
  advisories: readonly string[];
  edits: ReadonlyArray<{ path: string; expectedContentDigest: string }>;
  stagedPaths: readonly string[];
  reason?: string;
}

/** Run `arc wu reconcile [slug]` from the current work unit's own checkout. */
export async function handleWuReconcile(
  slugArg: string | undefined,
  opts: WuReconcileOptions,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const io = createUserIOContext();
  const exec = (cmd: string, args: string[]) => io.exec(cmd, args, { cwd });
  const [index, currentBranch] = await Promise.all([
    buildLifecycleIndex({ cwd, fs: nodeLifecycleFs }),
    getCurrentBranch(exec),
  ]);
  const target = await resolveOwnedTarget(cwd, index, currentBranch, slugArg);
  if ("reason" in target) {
    emitConflict(opts, target.slug, target.reason);
    return;
  }

  const result = await runCurrentWuReconcile({
    index,
    queryDisposition: (input) => queryGitRetirementDisposition(exec, "HEAD", input),
    readFile: (path) => io.readFile(resolve(cwd, path)),
    writeFile: (path, content) => io.writeFile(resolve(cwd, path), content),
    stagePaths: async (paths) => {
      if (paths.length > 0) await exec("git", ["add", "--", ...paths]);
    },
  }, {
    slug: target.slug,
    metaPath: target.metaPath,
    apply: opts.apply === true,
  });
  const envelope = toEnvelope(result);
  if (opts.json === true) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    emitHuman(envelope);
  }
  if (result.status === "conflict") process.exitCode = 1;
}

async function resolveOwnedTarget(
  cwd: string,
  index: Awaited<ReturnType<typeof buildLifecycleIndex>>,
  currentBranch: string | null,
  slugArg: string | undefined,
): Promise<{ slug: string; metaPath: string } | { slug: string; reason: string }> {
  if (currentBranch === null) {
    return { slug: slugArg?.trim() ?? "", reason: "current checkout has no branch identity" };
  }
  const matches: Array<{ slug: string; metaPath: string }> = [];
  for (const entry of index.values()) {
    let branch: string | null;
    try {
      branch = parseMetaRecord(await readFile(resolve(cwd, entry.path), "utf8")).Branch;
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
    `${action} dependency reconcile for \`${envelope.slug}\`: `
    + `${envelope.dependency.before.join(", ") || "[none]"} → `
    + `${envelope.dependency.after.join(", ") || "[none]"}.`,
  );
}

const nodeLifecycleFs: LifecycleIndexFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};
