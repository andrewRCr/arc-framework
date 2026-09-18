/** Git-backed Candidate subject collection for one work-unit branch. */

import type { GitExec } from "../git/exec.js";
import { resolveSoleMergeBase } from "../git/base-overlap.js";
import { isGitObjectId } from "../git/object-id.js";
import { readGitBlobEntry, type GitBlobEntry } from "../io-context.js";
import { classifyPathTreatment } from "../evidence-applicability/index.js";
import {
  identifyWorkUnitArtifactPath,
  type WorkUnitArtifactKind,
} from "../layout/index.js";
import { canonicalDigest, digestBytes } from "../canonical/canonical-json.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  CandidateLineageTargetSchema,
  createCandidateSubjectSnapshot,
  type CandidateLineageTarget,
  type CandidateSubjectEntryInput,
} from "./candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "./candidate-record-store.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import { resolveSubmissionBoundaryPath } from "./submission-boundary-store.js";

export interface CollectGitCandidateTargetInput {
  cwd: string;
  name: string;
  baseBranch: string;
  /** Exact authoritative base coordinate; otherwise use the best materialized configured-base ref. */
  baseRevision?: string;
  exec: GitExec;
  /** An exact committed target to collect instead of the current index. */
  revision?: string;
  readBlob?: (cwd: string, ref: string | null, path: string) => Promise<Uint8Array | null>;
  readEntry?: (cwd: string, ref: string | null, path: string) => Promise<GitBlobEntry | null>;
}

/** A collected subject, or the reason the branch and its base leave no single revision to collect one against. */
export type CandidateSubjectCollection =
  | { readonly status: "collected"; readonly target: CandidateLineageTarget }
  | {
      readonly status: "refused";
      readonly reason: "merge-base-ambiguous";
      readonly detail: string;
    };

/** Resolve the configured base from its materialized remote-tracking ref, falling back to the local branch. */
export async function resolveGitCandidateBaseRevision(input: {
  readonly cwd: string;
  readonly baseBranch: string;
  readonly exec: GitExec;
}): Promise<string> {
  const baseBranch = input.baseBranch.trim();
  if (baseBranch === "") throw new Error("Candidate subject collection requires a configured base branch");
  const options = { cwd: input.cwd, objectAccess: "local-only" as const };
  const remoteBaseRef = `refs/remotes/origin/${baseBranch}`;
  const remote = (await input.exec(
    "git",
    ["for-each-ref", "--format=%(objectname)", remoteBaseRef],
    options,
  )).stdout.trim();
  if (remote !== "") {
    const revisions = remote.split(/\r?\n/u);
    if (revisions.length !== 1 || revisions[0] === undefined || !isGitObjectId(revisions[0])) {
      throw new Error("Cannot resolve the materialized Candidate base revision");
    }
    return revisions[0];
  }
  const local = (await input.exec("git", ["rev-parse", "--verify", `${baseBranch}^{commit}`], options))
    .stdout.trim();
  if (!isGitObjectId(local)) throw new Error("Cannot resolve the Candidate base revision");
  return local;
}

/**
 * Resolve one path to the work unit's own artifact it holds, and to the path that keys it.
 *
 * A ship that archives in the same pass moves these before the checkpoint reads them, so the artifact
 * — not the location it currently occupies — is what a subject entry has to follow. The key is the
 * artifact's project-active path because `backlog`, `active`, and `completed` are stages one artifact
 * passes through. Contributor scope is not such a stage but a different owner, so a contributor-scoped
 * artifact keys to its own path: collapsing it onto the project path would merge two artifacts.
 */
function ownArtifactAt(
  name: string,
  path: string,
): { artifact: WorkUnitArtifactKind | "companion"; key: string } | null {
  let identified = identifyWorkUnitArtifactPath(path);
  let artifact: WorkUnitArtifactKind | "companion";
  const basename = path.slice(path.lastIndexOf("/") + 1);
  if (identified !== null && identified.slug === name) {
    artifact = identified.artifact;
  } else {
    if (!artifactMatcher(name).test(basename)) return null;
    const directory = path.slice(0, Math.max(0, path.lastIndexOf("/") + 1));
    identified = identifyWorkUnitArtifactPath(`${directory}notes-${name}.md`);
    if (identified === null || identified.slug !== name) return null;
    artifact = "companion";
  }
  const contributorScoped = identified.placement.kind === "active"
    && identified.placement.scope.kind === "contributor";
  return {
    artifact,
    key: contributorScoped ? path : `.arc/active/${basename}`,
  };
}

/**
 * Resolve where one path's content lands in the subject, and the treatment it receives there.
 *
 * The key differs from the classified path only for a relocated own artifact, whose content follows
 * the artifact while the location it vacated stays an evidence-neutral entry.
 */
function classifyCandidateSubjectPath(
  name: string,
  path: string,
  projectionPaths: ReadonlySet<string>,
): { key: string; treatment: CandidateSubjectEntryInput["treatment"] } {
  const own = ownArtifactAt(name, path);
  return {
    key: own?.key ?? path,
    treatment: classifyPathTreatment(path, { workUnit: name, projectionPaths }),
  };
}

/** The Candidate's own projections, which are reduced from the subject rather than part of it. */
function candidateProjectionPaths(name: string): ReadonlySet<string> {
  return new Set([resolveCandidateRecordRelativePath(name), resolveSubmissionBoundaryPath(name)]);
}

export interface CollectUnstagedReviewablePathsInput {
  cwd: string;
  name: string;
  exec: GitExec;
}

/**
 * Collect the reviewable-subject paths whose working-tree content the index does not carry.
 *
 * The subject below is the index, so content edited but left unstaged — and reviewable files Git is not
 * tracking at all — would be attested away without appearing anywhere in the result. Only paths whose
 * content reaches the subject as `reviewable` are reported: evidence-neutral writes and the Candidate's own
 * projections move without changing what review sees, so gating on them would refuse an ordinary
 * lifecycle tree.
 *
 * @param input - The checkout, the work unit whose artifacts key the classification, and its Git boundary.
 * @returns The affected repository-relative paths in canonical order; empty when the index carries them all.
 */
export async function collectUnstagedReviewablePaths(
  input: CollectUnstagedReviewablePathsInput,
): Promise<string[]> {
  const name = SlugSchema.parse(input.name);
  const options = { cwd: input.cwd, objectAccess: "local-only" as const };
  const read = async (args: string[]): Promise<string[]> =>
    (await input.exec("git", args, options)).stdout.split("\0").filter((path) => path !== "");
  const unstaged = await read(["diff", "--name-only", "--no-renames", "-z"]);
  const untracked = await read(["ls-files", "--others", "--exclude-standard", "-z"]);
  const projectionPaths = candidateProjectionPaths(name);
  return [...new Set([...unstaged, ...untracked])]
    .filter((path) => classifyCandidateSubjectPath(name, path, projectionPaths).treatment === "reviewable")
    .sort(compareUtf8);
}

/**
 * Collect the staged work-unit subject, or one exact committed subject, relative to its configured base.
 *
 * The subject is the base-relative diff from the single base the branch and its configured base share, rather
 * than the set the branch's own commits name. The two disagree in both directions: a path changed and reverted
 * within the branch leaves a permanent entry in the commit-derived set, so currentness never clears, while a
 * path the branch keeps its own side of across a base merge appears in no commit's diff at all and goes
 * uncontributed.
 *
 * @param input - The checkout, the work unit, its configured base, and the Git boundary to read through.
 * @returns The collected subject, or the refusal naming why there is no single base to collect it against.
 */
export async function collectGitCandidateSubject(
  input: CollectGitCandidateTargetInput,
): Promise<CandidateSubjectCollection> {
  const name = SlugSchema.parse(input.name);
  const baseBranch = input.baseBranch.trim();
  if (baseBranch === "") throw new Error("Candidate subject collection requires a configured base branch");
  const options = { cwd: input.cwd, objectAccess: "local-only" as const };
  const head = input.revision
    ?? (await input.exec("git", ["rev-parse", "HEAD"], options)).stdout.trim();
  if (!isGitObjectId(head)) throw new Error("Cannot resolve the Candidate head revision");
  const baseRevision = input.baseRevision
    ?? await resolveGitCandidateBaseRevision({ cwd: input.cwd, baseBranch, exec: input.exec });
  if (!isGitObjectId(baseRevision)) throw new Error("Cannot resolve the Candidate base revision");
  // Read every best common ancestor rather than the one Git would otherwise hand back. Over a history
  // leaving two, the ancestor that read picks decides which half of the branch's work the subject reports,
  // and names neither the choice nor the alternative — so what an attestation binds as the contribution
  // depends on a selection nothing recorded. Refusing is what keeps that half from being bound at all.
  const sole = await resolveSoleMergeBase({
    exec: (command, args) => input.exec(command, args, options),
    leftRevision: head,
    rightRevision: baseRevision,
  });
  if (sole.status === "ambiguous") {
    return { status: "refused", reason: "merge-base-ambiguous", detail: sole.detail };
  }
  // A base that cannot be read, and one the branch shares no lineage with, both already reached the caller
  // as a raised failure and still do; only the choice made silently is converted here.
  if (sole.status !== "resolved") throw new Error("Cannot resolve the Candidate base revision");
  const base = sole.mergeBase;
  const changed = (await input.exec(
    "git",
    input.revision === undefined
      ? ["diff", "--cached", "--name-only", "-z", base, "--"]
      : ["diff", "--name-only", "-z", base, head, "--"],
    options,
  )).stdout.split("\0").filter((path) => path !== "");
  const paths = [...new Set(changed)].sort(compareUtf8);
  const readEntry = input.readEntry ?? (input.readBlob === undefined
    ? readGitBlobEntry
    : async (cwd: string, ref: string | null, path: string) => {
        const bytes = await input.readBlob?.(cwd, ref, path) ?? null;
        return bytes === null ? null : { mode: "100644", bytes };
      });
  // The Candidate's own record and the publication boundary reduced from it are projections of this
  // subject, so digesting them would make the subject reference itself. The boundary is written
  // where pre-publication settles — before submission reads currentness — so classifying it is what
  // keeps a settled Candidate current rather than blocked by its own settle-point write.
  const projectionPaths = candidateProjectionPaths(name);
  const entries = new Map<string, CandidateSubjectEntryInput>();
  const relocated = new Map<string, {
    digest: string;
    mode: string;
    treatment: CandidateSubjectEntryInput["treatment"];
  }>();
  const absentPaths = new Set<string>();
  for (const path of paths) {
    const entry = await readEntry(input.cwd, input.revision ?? null, path);
    const digest = entry === null ? canonicalDigest({ path, state: "absent" }) : digestBytes(entry.bytes);
    const mode = entry?.mode ?? "absent";
    const classification = classifyCandidateSubjectPath(name, path, projectionPaths);
    if (classification.key !== path) {
      // Reaching the artifact's new location is a lifecycle write, so the location itself is
      // evidence-neutral and the content it carries stays keyed to the artifact. The move alone leaves the
      // reviewable subject byte-identical; an edit made along the way still lands as a changed entry.
      if (entry !== null) {
        if (relocated.has(classification.key)) {
          throw new Error(`Multiple work-unit artifacts resolve to Candidate key \`${classification.key}\``);
        }
        relocated.set(classification.key, { digest, mode, treatment: classification.treatment });
      }
      entries.set(path, { path, digest, mode, treatment: "evidence-neutral" });
      if (entry === null) absentPaths.add(path);
      continue;
    }
    entries.set(path, { path, digest, mode, treatment: classification.treatment });
    if (entry === null) absentPaths.add(path);
  }
  for (const [path, relocatedEntry] of relocated) {
    if (entries.has(path) && !absentPaths.has(path)) {
      throw new Error(`A relocated work-unit artifact collides with Candidate key \`${path}\``);
    }
    entries.set(path, {
      path,
      digest: relocatedEntry.digest,
      mode: relocatedEntry.mode,
      treatment: relocatedEntry.treatment,
    });
  }
  return {
    status: "collected",
    target: CandidateLineageTargetSchema.parse({
      revision: head,
      subject: createCandidateSubjectSnapshot([...entries.values()]),
    }),
  };
}

/**
 * Collect the subject, raising a refusal rather than returning it.
 *
 * Every caller reached through here inherits one policy for a base that resolves to no single revision, which
 * is the policy the reader itself used to hold. It goes away once each call site applies its own.
 *
 * @param input - The same collection input the reader takes.
 * @returns The collected subject.
 */
export async function collectGitCandidateTarget(
  input: CollectGitCandidateTargetInput,
): Promise<CandidateLineageTarget> {
  const collected = await collectGitCandidateSubject(input);
  if (collected.status !== "collected") throw new Error(collected.detail);
  return collected.target;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
