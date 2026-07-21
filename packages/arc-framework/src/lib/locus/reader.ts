/** Single bounded reader for the public locus roster envelope. */

import { join } from "node:path";

import {
  acquireLocusEvidence,
  type LocusEvidenceIO,
  type LocusEvidenceResult,
} from "./evidence.js";
import type { PathFlavor } from "./path-identity.js";
import {
  projectManagedSubject,
  projectProvisionalRoster,
  type ManagedSubjectProjection,
} from "./roster.js";
import { LocusEnvelopeV1Schema, type LocusEnvelopeV1 } from "./schema/index.js";
import { deriveLocusFrames } from "./state.js";
import {
  projectCheckoutSubjectMeta,
  type SubjectMetaIO,
  type SubjectMetaProjection,
} from "./subject-meta.js";

export interface ReadLocusEnvelopeOptions {
  identity: string | null;
  pathFlavor: PathFlavor;
  evidenceIO: LocusEvidenceIO;
  subjectMetaIO: SubjectMetaIO;
  identityGlobalUserDir?: string | null;
  activeExtensions: readonly string[];
}

/** Acquire, join, derive, and producer-validate one complete public roster. */
export async function readLocusEnvelope(options: ReadLocusEnvelopeOptions): Promise<LocusEnvelopeV1> {
  const evidence = await acquireLocusEvidence({
    identity: options.identity,
    pathFlavor: options.pathFlavor,
    io: options.evidenceIO,
  });
  if (evidence.kind === "error") {
    return LocusEnvelopeV1Schema.parse({
      mode: "locus",
      ok: false,
      error: { code: evidence.code, message: evidence.message },
    });
  }
  const subjects = await projectSubjects(evidence, options);
  const provisional = projectProvisionalRoster({ evidence, subjects });
  const frames = deriveLocusFrames({
    rows: provisional.rows,
    enteringAnchor: { kind: "unverifiable", reason: "Read-only roster query" },
  });
  return LocusEnvelopeV1Schema.parse({
    mode: "locus",
    ok: true,
    primaryPath: evidence.root.primaryPath,
    rows: frames.rows,
    diagnostics: provisional.diagnostics,
  });
}

async function projectSubjects(
  evidence: Extract<LocusEvidenceResult, { kind: "complete" }>,
  options: ReadLocusEnvelopeOptions,
): Promise<ReadonlyMap<string, ManagedSubjectProjection>> {
  const projected = new Map<string, ManagedSubjectProjection>();
  if (options.identity === null) return projected;
  const identity = options.identity;
  await Promise.all(evidence.records.map(async (entry) => {
    if (entry.result.kind !== "valid" || entry.canonical?.kind !== "resolved") return;
    const recordCanonicalPath = entry.canonical.path;
    const checkouts = evidence.checkouts.filter((checkout) =>
      checkout.canonical.kind === "resolved" && checkout.canonical.path === recordCanonicalPath);
    const checkout = checkouts.length === 1 ? checkouts[0] : undefined;
    if (checkout === undefined) return;
    const record = entry.result.record;
    const meta = record.role.kind === "work-unit"
      ? await projectWorkUnitMeta(checkout, record.role.subject.key, { ...options, identity })
      : null;
    projected.set(record.recordId, projectManagedSubject({
      identity,
      checkout: checkout.worktree,
      record,
      marker: checkout.marker,
      identities: evidence.identities,
      meta,
    }));
  }));
  return projected;
}

async function projectWorkUnitMeta(
  checkout: Extract<LocusEvidenceResult, { kind: "complete" }>["checkouts"][number],
  subjectKey: string,
  options: ReadLocusEnvelopeOptions & { identity: string },
): Promise<SubjectMetaProjection> {
  const maintainerPath = join(checkout.worktree.path, ".arc", "active", `meta-${subjectKey}.md`);
  const contributorPath = join(
    checkout.worktree.path,
    ".arc",
    "user",
    options.identity,
    "active",
    `meta-${subjectKey}.md`,
  );
  const maintainerCount = checkout.metas.filter((candidate) => candidate.path === maintainerPath).length;
  const contributorCount = checkout.metas.filter((candidate) => candidate.path === contributorPath).length;
  if (maintainerCount + contributorCount !== 1) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: `Expected one exact subject meta for ${subjectKey}; found ${maintainerCount + contributorCount}`,
      metaPath: null,
    };
  }
  const metaRoot = maintainerCount === 1
    ? { kind: "maintainer" as const }
    : { kind: "contributor" as const, identity: options.identity };
  return projectCheckoutSubjectMeta({
    cwd: checkout.worktree.path,
    subjectKey,
    identity: options.identity,
    identityGlobalUserDir: options.identityGlobalUserDir,
    metaRoot,
    candidates: checkout.metas,
    activeExtensions: options.activeExtensions,
    io: options.subjectMetaIO,
  });
}
