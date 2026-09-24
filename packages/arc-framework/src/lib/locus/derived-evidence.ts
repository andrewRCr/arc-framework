/** Bounded worktree-first evidence acquisition without record, lock, or process inputs. */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import {
  readTransientIdentitySnapshot,
  type TransientIdentitySnapshot,
} from "../errand/identity-snapshot.js";
import type { GitExec } from "../git/exec.js";
import type {
  RegisteredWorktree,
  RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import {
  decodeWorktreeMarkerOwnership,
  readWorktreeMarkerGeneration,
  type WorktreeMarkerGenerationReadResult,
} from "../git/worktree-marker.js";
import { digestBytes } from "../kernel/canonical/canonical-json.js";
import { canonicalLocalPath } from "../local-path-identity.js";
import {
  readArchivedWorkUnitMetaFromRef,
  readCompletedEvidenceFromRef,
  type ArchivedWorkUnitMetaRead,
  type CompletedEvidenceRead,
} from "../work-unit/completed-index.js";
import type { DormantMarkerGenerationEvidence } from "./derived-lifecycle-evidence.js";
import type { DormantCheckoutReadEvidence } from "./derived-reader.js";
import type { OccupancyMarker } from "./occupancy-marker.js";
import { readPrimarySafety } from "./primary-safety.js";
import type { PrimarySafetyProjection } from "./role-derivation.js";

/** Exact I/O surface permitted to feed the derived reader. */
export interface DerivedLocusEvidenceIO {
  scanWorktrees(): Promise<RegisteredWorktreeScanResult>;
  listDirectory(path: string): Promise<string[]>;
  readArchivedMeta(checkoutPath: string, ref: string, slug: string): Promise<ArchivedWorkUnitMetaRead>;
  readText(path: string): Promise<string>;
  readMarker(path: string): Promise<WorktreeMarkerGenerationReadResult>;
  readIdentities(): Promise<TransientIdentitySnapshot>;
  readCompleted(): Promise<CompletedEvidenceRead>;
  readPrimarySafety(primaryPath: string): Promise<PrimarySafetyProjection>;
  canonicalizePath(path: string): Promise<string>;
}

/** Compose production worktree-derived evidence dependencies. */
export function createDerivedLocusEvidenceIO(options: {
  readonly exec: GitExec;
  readonly identity: string;
  readonly baseBranch: string;
}): DerivedLocusEvidenceIO {
  return {
    scanWorktrees: () => scanRegisteredWorktrees(options.exec),
    listDirectory: (path) => readdir(path),
    readArchivedMeta: async (checkoutPath, ref, slug) => {
      const exec = bindGitExec(options.exec, checkoutPath);
      const committed = await readArchivedWorkUnitMetaFromRef(exec, ref, slug);
      return committed.kind === "absent"
        ? readStagedArchivedWorkUnitMeta(exec, ref, slug)
        : committed;
    },
    readText: (path) => readFile(path, "utf8"),
    readMarker: readWorktreeMarkerGeneration,
    readIdentities: () => readTransientIdentitySnapshot({ exec: options.exec, identity: options.identity }),
    readCompleted: () => readCompletedEvidenceFromRef(options.exec, options.baseBranch),
    readPrimarySafety: async (primaryPath) => {
      const result = await readPrimarySafety({
        primaryPath,
        baseBranch: options.baseBranch,
        exec: options.exec,
      });
      return result.kind === "complete"
        ? { kind: "complete", clean: result.clean, onBase: result.onBase }
        : { kind: "error", message: result.message };
    },
    canonicalizePath: (path) => canonicalLocalPath(path),
  };
}

/** One complete authority snapshot, or the topology failure that prevents any checkout projection. */
export type DerivedLocusEvidenceResult =
  | { readonly kind: "error"; readonly code: "git-topology-unavailable"; readonly message: string }
  | {
      readonly kind: "complete";
      readonly topology: Extract<RegisteredWorktreeScanResult, { ok: true }>;
      readonly checkouts: readonly DormantCheckoutReadEvidence[];
      readonly completed: CompletedEvidenceRead;
      readonly identities: TransientIdentitySnapshot;
      readonly primarySafety: PrimarySafetyProjection;
    };

/** Acquire all and only the evidence accepted by the worktree-derived reader. */
export async function acquireDerivedLocusEvidence(options: {
  readonly identity: string;
  readonly io: DerivedLocusEvidenceIO;
}): Promise<DerivedLocusEvidenceResult> {
  let topology: RegisteredWorktreeScanResult;
  try {
    topology = await options.io.scanWorktrees();
  } catch (error) {
    return topologyFailure(error);
  }
  if (!topology.ok) return topologyFailure(topology.message);
  const primary = topology.worktrees.filter((worktree) => worktree.primary);
  const primaryPath = primary.length === 1 ? primary[0]?.path : undefined;
  const [checkouts, completed, identities, primarySafety] = await Promise.all([
    Promise.all(topology.worktrees.map((worktree) => readCheckout(worktree, options.identity, options.io))),
    options.io.readCompleted().catch((error: unknown): CompletedEvidenceRead => {
      void error;
      return {
        status: "unavailable",
        reason: "archive-tree-read-failed",
      };
    }),
    options.io.readIdentities().catch((error: unknown): TransientIdentitySnapshot => ({
      kind: "error",
      stage: "tree",
      message: errorMessage(error),
    })),
    primaryPath === undefined
      ? Promise.resolve<PrimarySafetyProjection>({
          kind: "error",
          message: `Expected one registered primary checkout; found ${primary.length}`,
        })
      : options.io.readPrimarySafety(primaryPath).catch((error: unknown): PrimarySafetyProjection => ({
          kind: "error",
          message: errorMessage(error),
        })),
  ]);
  return { kind: "complete", topology, checkouts, completed, identities, primarySafety };
}

async function readCheckout(
  worktree: RegisteredWorktree,
  identity: string,
  io: DerivedLocusEvidenceIO,
): Promise<DormantCheckoutReadEvidence> {
  const roots = [
    join(worktree.path, ".arc", "active"),
    join(worktree.path, ".arc", "user", identity, "active"),
  ];
  const [marker, listings] = await Promise.all([
    io.readMarker(worktree.path).then(projectMarker, (error: unknown): DormantMarkerGenerationEvidence => ({
      kind: "error",
      reason: errorMessage(error),
    })),
    Promise.all(roots.map(async (path) => {
      try {
        return { kind: "listed" as const, path, names: await io.listDirectory(path) };
      } catch (error) {
        return errorCode(error) === "ENOENT"
          ? { kind: "listed" as const, path, names: [] as string[] }
          : { kind: "error" as const, path, message: errorMessage(error), names: [] as string[] };
      }
    })),
  ]);
  const metas = await Promise.all(listings.flatMap((listing) => listing.kind === "listed"
    ? listing.names
      .filter((name) => /^meta-.*\.md$/u.test(name))
      .map((name) => ({ name, path: join(listing.path, name) }))
    : [])
    .map(async ({ name, path }) => {
      try {
        return { kind: "read" as const, name, path, text: await io.readText(path) };
      } catch (error) {
        return { kind: "error" as const, name, path, message: errorMessage(error) };
      }
    }));
  const archivedSubject = marker.kind === "present" && marker.marker.createdFor.kind === "work-unit"
    ? marker.marker.createdFor.name
    : null;
  const archivedRoot = join(worktree.path, ".arc", "completed");
  const archivedRead = archivedSubject === null
    ? null
    : await io.readArchivedMeta(worktree.path, worktree.head, archivedSubject)
      .catch((error: unknown): ArchivedWorkUnitMetaRead => ({
        kind: "unreadable",
        reason: errorMessage(error),
      }));
  const archivedMetas = archivedRead?.kind === "read"
    ? [{
        kind: "read" as const,
        name: basename(archivedRead.path),
        path: join(worktree.path, archivedRead.path),
        text: archivedRead.text,
      }]
    : [];
  const archivedRootError = archivedRead?.kind === "duplicate"
    ? `Duplicate archived metadata paths: ${archivedRead.paths.join(", ")}`
    : archivedRead?.kind === "unreadable"
      ? archivedRead.reason
      : null;
  return {
    checkoutPath: worktree.path,
    marker,
    metaRoots: listings.map((listing) => listing.kind === "listed"
      ? { kind: "listed" as const, path: listing.path }
      : { kind: "error" as const, path: listing.path, message: listing.message }),
    metas,
    archivedMetaRoots: archivedSubject === null
      ? []
      : [archivedRootError === null
          ? { kind: "listed" as const, path: archivedRoot }
          : { kind: "error" as const, path: archivedRoot, message: archivedRootError }],
    archivedMetas,
  };
}

/** Admit only the exact indexed form produced by an uncommitted integration archive sweep. */
async function readStagedArchivedWorkUnitMeta(
  exec: GitExec,
  head: string,
  slug: string,
): Promise<ArchivedWorkUnitMetaRead> {
  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const archivedPath = new RegExp(
    `^\\.arc/completed/[^/]+/\\d+_${escapedSlug}/meta-${escapedSlug}\\.md$`,
    "u",
  );
  let indexPaths: string[];
  try {
    const { stdout } = await exec("git", ["ls-files", "--cached", "-z", "--", ".arc/completed/"]);
    indexPaths = stdout.split("\0").filter((path) => archivedPath.test(path));
  } catch {
    return { kind: "unreadable", reason: "archive-index-read-failed" };
  }
  if (indexPaths.length === 0) return { kind: "absent" };
  if (indexPaths.length > 1) return { kind: "duplicate", paths: indexPaths.sort() };

  const path = indexPaths[0];
  if (path === undefined) return { kind: "absent" };
  const activePath = `.arc/active/meta-${slug}.md`;
  let activeIndex: string;
  let activeText: string;
  let archivedText: string;
  try {
    [
      { stdout: activeIndex },
      { stdout: activeText },
      { stdout: archivedText },
    ] = await Promise.all([
      exec("git", ["ls-files", "--cached", "-z", "--", `:(literal)${activePath}`]),
      exec("git", ["show", `${head}:${activePath}`]),
      exec("git", ["show", `:${path}`]),
    ]);
  } catch {
    return { kind: "unreadable", path, reason: "staged-archive-transition-read-failed" };
  }
  if (activeIndex !== "") {
    return { kind: "unreadable", path, reason: "staged-archive-source-remains-indexed" };
  }

  try {
    const active = parseMetaRecord(activeText);
    const archived = parseMetaRecord(archivedText);
    if (active.state !== "Integrating"
      || archived.state !== "Shipped"
      || active.owner === null
      || archived.owner !== active.owner
      || active.branch === null
      || archived.branch !== null
      || archived.candidateId !== active.candidateId
      || archived.taskList !== active.taskList) {
      return { kind: "unreadable", path, reason: "staged-archive-transition-mismatch" };
    }
  } catch {
    return { kind: "unreadable", path, reason: "staged-archive-meta-invalid" };
  }
  return { kind: "read", path, text: archivedText };
}

function bindGitExec(exec: GitExec, cwd: string): GitExec {
  return (command, args, options) => exec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  });
}

function projectMarker(result: WorktreeMarkerGenerationReadResult): DormantMarkerGenerationEvidence {
  if (result.kind === "absent") return result;
  if (result.kind === "malformed") return { kind: "malformed", reason: result.message };
  const decoded = decodeWorktreeMarkerOwnership(result.marker);
  if (decoded.kind !== "current") {
    return { kind: "malformed", reason: `Marker ownership is ${decoded.reason}` };
  }
  const subject = decoded.subject;
  if (subject.kind === "branch") {
    return { kind: "malformed", reason: "Branch-only marker ownership has no session subject" };
  }
  let marker: OccupancyMarker;
  if (subject.kind === "work-unit") {
    marker = { spawnedByArc: true, createdFor: { kind: "work-unit", name: subject.name } };
  } else {
    if (decoded.provisioning === null) {
      return { kind: "malformed", reason: "Transient marker ownership has no provisioning state" };
    }
    const common = {
      spawnedByArc: result.marker.spawnedByArc,
      provisioning: decoded.provisioning,
      ...(result.marker.parentCheckoutPath === undefined
        ? {}
        : { parentCheckoutPath: result.marker.parentCheckoutPath }),
    };
    if (subject.kind === "partial-errand") {
      const originEntry = result.marker.originEntry;
      const originEntrySourceDigest = result.marker.originEntrySourceDigest;
      marker = originEntry === undefined || originEntrySourceDigest === undefined
        ? { ...common, createdFor: subject }
        : { ...common, createdFor: subject, originEntry, originEntrySourceDigest };
    } else {
      marker = { ...common, createdFor: subject };
    }
  }
  return { kind: "present", marker, generation: digestBytes(result.bytes) };
}

function topologyFailure(error: unknown): Extract<DerivedLocusEvidenceResult, { kind: "error" }> {
  return { kind: "error", code: "git-topology-unavailable", message: errorMessage(error) };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
