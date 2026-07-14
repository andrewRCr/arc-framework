/** Git-backed classification for the current lifecycle bookkeeping tail. */

import type { GitExec } from "../../../../lib/git/exec.js";
import { parseMetaRecord } from "../../../../lib/active/meta-reader.js";
import type {
  LifecycleTailProofAdapter,
  LifecycleTailProofResolutionInput,
} from "../../core/ports.js";
import type {
  LifecycleTailArtifactIdentity,
  LifecycleTailDiagnostic,
  LifecycleTailProof,
} from "../../core/lifecycle-tail.js";

const PREDICATE_ID = "lifecycle-bookkeeping-tail/v1";
const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const COHORT_PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/u;
const DIAGNOSTIC_ORDER: LifecycleTailDiagnostic[] = [
  "invalid-predicate",
  "invalid-identity",
  "base-ref-drift",
  "diff-base-drift",
  "policy-version-drift",
  "rubric-version-drift",
  "source-identity-drift",
  "ambiguous-artifact-group",
  "invalid-artifact-group",
  "unrecognized-tail-change",
  "tail-unavailable",
];

interface PathChange {
  status: "A" | "D" | "M";
  path: string;
}

interface ArchiveDestination {
  directory: string;
  quarter: string;
  sequence: string;
}

interface CohortPair {
  source: string;
  destination: string;
}

type ChangedPathsResult =
  | { kind: "resolved"; changes: PathChange[] }
  | { kind: "unavailable" }
  | { kind: "malformed" };

/** Dependencies for the Git-backed lifecycle-tail proof adapter. */
export interface GitLifecycleTailProofAdapterOptions {
  exec: GitExec;
}

function emptyArtifact(): LifecycleTailArtifactIdentity {
  return { workUnitId: "", artifactGroupId: "", cohortPath: null };
}

function diagnostics(values: LifecycleTailDiagnostic[]): LifecycleTailDiagnostic[] {
  return [...new Set(values)].sort((left, right) =>
    DIAGNOSTIC_ORDER.indexOf(left) - DIAGNOSTIC_ORDER.indexOf(right));
}

function invalid(
  input: LifecycleTailProofResolutionInput,
  values: LifecycleTailDiagnostic[],
  artifact = emptyArtifact(),
): LifecycleTailProof {
  return {
    schemaVersion: 1,
    predicateId: input.predicateId,
    reviewedThroughSha: input.reviewedThroughSha,
    currentHeadSha: input.currentHeadSha,
    baseRef: input.current.baseRef,
    diffBaseSha: input.current.diffBaseSha,
    policyVersion: input.current.policyVersion,
    rubricVersion: input.current.rubricVersion,
    sourceIdentity: input.current.sourceIdentity,
    artifact,
    diagnostics: diagnostics(values),
  };
}

function validInput(input: LifecycleTailProofResolutionInput): boolean {
  return SHA.test(input.reviewedThroughSha)
    && SHA.test(input.currentHeadSha)
    && SHA.test(input.reviewed.diffBaseSha)
    && SHA.test(input.current.diffBaseSha)
    && DIGEST.test(input.reviewed.policyVersion)
    && DIGEST.test(input.current.policyVersion)
    && input.reviewed.baseRef.length > 0
    && input.current.baseRef.length > 0
    && input.reviewed.rubricVersion.length > 0
    && input.current.rubricVersion.length > 0
    && input.reviewed.sourceIdentity.length > 0
    && input.current.sourceIdentity.length > 0;
}

function scopeDiagnostics(input: LifecycleTailProofResolutionInput): LifecycleTailDiagnostic[] {
  const values: LifecycleTailDiagnostic[] = [];
  if (input.reviewed.baseRef !== input.current.baseRef) values.push("base-ref-drift");
  if (input.reviewed.diffBaseSha !== input.current.diffBaseSha) values.push("diff-base-drift");
  if (input.reviewed.policyVersion !== input.current.policyVersion) values.push("policy-version-drift");
  if (input.reviewed.rubricVersion !== input.current.rubricVersion) values.push("rubric-version-drift");
  if (input.reviewed.sourceIdentity !== input.current.sourceIdentity) values.push("source-identity-drift");
  return values;
}

function parseNameStatusZ(stdout: string): PathChange[] | null {
  const fields = stdout.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2 !== 0) return null;
  const changes: PathChange[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (path === undefined || path.length === 0 || (status !== "A" && status !== "D" && status !== "M")) {
      return null;
    }
    changes.push({ status, path });
  }
  return changes;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function activeMetaSlug(path: string): string | null {
  const match = /^\.arc\/active\/meta-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u.exec(path);
  return match?.[1] ?? null;
}

function archiveDestination(path: string, slug: string): ArchiveDestination | null {
  const escaped = escapeRegExp(slug);
  const match = new RegExp(
    `^(\\.arc/completed/([0-9]{4}-q[1-4])/([0-9]{2})_${escaped})/meta-${escaped}\\.md$`,
    "u",
  ).exec(path);
  if (match === null) return null;
  const directory = match[1];
  const quarter = match[2];
  const sequence = match[3];
  if (directory === undefined || quarter === undefined || sequence === undefined) return null;
  return { directory, quarter, sequence };
}

function sourceArtifactPath(slug: string, prefix: string): string {
  return `.arc/active/${prefix}-${slug}.md`;
}

function destinationArtifactPath(destination: ArchiveDestination, slug: string, prefix: string): string {
  return `${destination.directory}/${prefix}-${slug}.md`;
}

async function changedPaths(
  exec: GitExec,
  reviewedThroughSha: string,
  currentHeadSha: string,
): Promise<ChangedPathsResult> {
  try {
    const { stdout } = await exec("git", [
      "diff",
      "--no-ext-diff",
      "--no-renames",
      "--name-status",
      "-z",
      reviewedThroughSha,
      currentHeadSha,
    ]);
    const changes = parseNameStatusZ(stdout);
    return changes === null ? { kind: "malformed" } : { kind: "resolved", changes };
  } catch {
    return { kind: "unavailable" };
  }
}

async function showText(exec: GitExec, ref: string, path: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["show", `${ref}:${path}`]);
    return stdout;
  } catch {
    return null;
  }
}

async function blobId(exec: GitExec, ref: string, path: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}:${path}`]);
    const value = stdout.trim();
    return SHA.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function sameBlob(
  exec: GitExec,
  reviewedThroughSha: string,
  source: string,
  currentHeadSha: string,
  destination: string,
): Promise<"same" | "different" | "unavailable"> {
  const [left, right] = await Promise.all([
    blobId(exec, reviewedThroughSha, source),
    blobId(exec, currentHeadSha, destination),
  ]);
  if (left === null || right === null) return "unavailable";
  return left === right ? "same" : "different";
}

function normalizeCohort(value: string | null): string | null | undefined {
  if (value === null || value.trim() === "" || value.trim() === "[none]") return null;
  const normalized = value.trim();
  return COHORT_PATH.test(normalized) ? normalized : undefined;
}

function artifactFromMeta(content: string, slug: string): LifecycleTailArtifactIdentity | null {
  try {
    const record = parseMetaRecord(content);
    if (record.State !== "Integrating" || record["Task List"] !== `tasks-${slug}.md`) return null;
    const cohortPath = normalizeCohort(record.Cohort);
    if (cohortPath === undefined) return null;
    return { workUnitId: slug, artifactGroupId: `work-unit:${slug}`, cohortPath };
  } catch {
    return null;
  }
}

function stableMetaArchiveText(content: string): string {
  const mutable = /^(?:- \*\*(?:State|Branch|Current Workflow|Next Task|Blockers|Next Action|PR URL|Completed):\*\*)/u;
  return content.split("\n").filter((line) => !mutable.test(line)).map((line) => {
    if (!line.startsWith("|") || (!line.includes("Integrating") && !line.includes("Shipped"))) return line;
    const cells = line.split("|");
    if (cells.length >= 6) {
      cells[1] = " <archive-state> ";
      cells[3] = " <archive-branch> ";
    }
    return cells.join("|");
  }).join("\n");
}

function validArchivedMeta(source: string, destination: string, slug: string): boolean {
  try {
    const sourceRecord = parseMetaRecord(source);
    const destinationRecord = parseMetaRecord(destination);
    if (
      sourceRecord.State !== "Integrating"
      || destinationRecord.State !== "Shipped"
      || destinationRecord["Task List"] !== `tasks-${slug}.md`
      || destinationRecord.Cohort !== sourceRecord.Cohort
      || (destinationRecord.Branch !== null && destinationRecord.Branch !== "[none]")
      || (destinationRecord["Current Workflow"] !== null && destinationRecord["Current Workflow"] !== "[none]")
      || (destinationRecord["Next Task"] !== null && destinationRecord["Next Task"] !== "[none]")
      || (destinationRecord.Blockers !== null && destinationRecord.Blockers !== "[none]")
      || (destinationRecord["Next Action"] !== null && destinationRecord["Next Action"] !== "[none]")
      || (destinationRecord.Completed !== null
        && destinationRecord.Completed !== "[none]"
        && !/^\d{4}-\d{2}-\d{2}$/u.test(destinationRecord.Completed))
    ) return false;
    return stableMetaArchiveText(source) === stableMetaArchiveText(destination);
  } catch {
    return false;
  }
}

function validCohortCloseout(source: string, destination: string, slug: string): boolean {
  if (source === destination) return true;
  const marker = source.lastIndexOf("\n---");
  if (marker < 0 || destination.slice(0, marker) !== source.slice(0, marker)) return false;
  const closeout = destination.slice(marker);
  return /^\n---\n\n## Closeout\n\n- \*\*Closed:\*\* \d{4}-\d{2}-\d{2}\n- \*\*Final member:\*\* `[^`]+`\n- \*\*Member archives:\*\* .+\n- \*\*Outcome:\*\* .+\n- \*\*Follow-up:\*\* .+\n\n---\n?$/u.test(closeout)
    && closeout.includes(`\n- **Final member:** \`${slug}\``);
}

function consume(remaining: Map<string, PathChange>, status: PathChange["status"], path: string): boolean {
  const change = remaining.get(path);
  if (change?.status !== status) return false;
  remaining.delete(path);
  return true;
}

function optionalPair(remaining: Map<string, PathChange>, source: string, destination: string): boolean {
  const left = remaining.get(source);
  const right = remaining.get(destination);
  if (left === undefined && right === undefined) return true;
  return consume(remaining, "D", source) && consume(remaining, "A", destination);
}

function cohortPairs(
  artifact: LifecycleTailArtifactIdentity,
  destination: ArchiveDestination,
): CohortPair[] {
  if (artifact.cohortPath === null) return [];
  const segments = artifact.cohortPath.split("/");
  const leaf = segments.at(-1);
  if (leaf === undefined) return [];
  const pairs: CohortPair[] = [{
    source: `.arc/backlog/planned/${artifact.cohortPath}/cohort-${leaf}.md`,
    destination: `.arc/completed/${destination.quarter}/${destination.sequence}a_cohort-${leaf}/cohort-${leaf}.md`,
  }];
  const parent = segments.length === 2 ? segments[0] : undefined;
  if (parent !== undefined) {
    pairs.push({
      source: `.arc/backlog/planned/${parent}/cohort-${parent}.md`,
      destination: `.arc/completed/${destination.quarter}/${destination.sequence}b_cohort-${parent}/cohort-${parent}.md`,
    });
  }
  return pairs;
}

function companionPrefix(path: string, directory: string, slug: string, source: boolean): string | null {
  const base = source ? ".arc/active" : directory;
  const escaped = escapeRegExp(slug);
  const match = new RegExp(`^${escapeRegExp(base)}/([a-z]+)-${escaped}\\.md$`, "u").exec(path);
  return match?.[1] ?? null;
}

async function classifyTail(
  exec: GitExec,
  input: LifecycleTailProofResolutionInput,
): Promise<LifecycleTailProof | null> {
  if (!validInput(input)) return invalid(input, ["invalid-identity"]);
  if (input.reviewedThroughSha === input.currentHeadSha) return null;
  if (input.predicateId !== PREDICATE_ID) return invalid(input, ["invalid-predicate"]);
  const drift = scopeDiagnostics(input);
  if (drift.length > 0) return invalid(input, drift);

  const changed = await changedPaths(exec, input.reviewedThroughSha, input.currentHeadSha);
  if (changed.kind === "unavailable") return invalid(input, ["tail-unavailable"]);
  if (changed.kind === "malformed") return invalid(input, ["unrecognized-tail-change"]);
  const { changes } = changed;
  const remaining = new Map<string, PathChange>();
  for (const change of changes) {
    if (remaining.has(change.path)) return invalid(input, ["unrecognized-tail-change"]);
    remaining.set(change.path, change);
  }

  const metas = changes.filter((change) => change.status === "D" && activeMetaSlug(change.path) !== null);
  if (metas.length !== 1) {
    return invalid(input, [metas.length > 1 ? "ambiguous-artifact-group" : "invalid-artifact-group"]);
  }
  const sourceMeta = metas[0];
  if (sourceMeta === undefined) return invalid(input, ["invalid-artifact-group"]);
  const slug = activeMetaSlug(sourceMeta.path);
  if (slug === null || !SLUG.test(slug)) return invalid(input, ["invalid-artifact-group"]);
  const destinations = changes
    .filter((change) => change.status === "A")
    .map((change) => ({ change, destination: archiveDestination(change.path, slug) }))
    .filter((candidate) => candidate.destination !== null);
  if (destinations.length !== 1) {
    return invalid(input, [destinations.length > 1 ? "ambiguous-artifact-group" : "invalid-artifact-group"]);
  }
  const destinationCandidate = destinations[0];
  if (destinationCandidate === undefined || destinationCandidate.destination === null) {
    return invalid(input, ["invalid-artifact-group"]);
  }
  const destination = destinationCandidate.destination;
  const destinationMeta = destinationCandidate.change.path;
  if (!consume(remaining, "D", sourceMeta.path) || !consume(remaining, "A", destinationMeta)) {
    return invalid(input, ["invalid-artifact-group"]);
  }

  const sourceContent = await showText(exec, input.reviewedThroughSha, sourceMeta.path);
  if (sourceContent === null) return invalid(input, ["tail-unavailable"]);
  const artifact = artifactFromMeta(sourceContent, slug);
  if (artifact === null) return invalid(input, ["invalid-artifact-group"]);
  const destinationContent = await showText(exec, input.currentHeadSha, destinationMeta);
  if (destinationContent === null) return invalid(input, ["tail-unavailable"], artifact);
  if (!validArchivedMeta(sourceContent, destinationContent, slug)) {
    return invalid(input, ["unrecognized-tail-change"], artifact);
  }

  const sourceTasks = sourceArtifactPath(slug, "tasks");
  const destinationTasks = destinationArtifactPath(destination, slug, "tasks");
  if (!consume(remaining, "D", sourceTasks) || !consume(remaining, "A", destinationTasks)) {
    return invalid(input, ["invalid-artifact-group"], artifact);
  }
  const tasksEquality = await sameBlob(exec, input.reviewedThroughSha, sourceTasks, input.currentHeadSha, destinationTasks);
  if (tasksEquality === "unavailable") return invalid(input, ["tail-unavailable"], artifact);
  if (tasksEquality !== "same") return invalid(input, ["unrecognized-tail-change"], artifact);

  const sourceNotes = sourceArtifactPath(slug, "notes");
  const destinationNotes = destinationArtifactPath(destination, slug, "notes");
  const notesSource = remaining.get(sourceNotes);
  const notesDestination = remaining.get(destinationNotes);
  if (notesDestination !== undefined && notesSource === undefined) {
    return invalid(input, ["unrecognized-tail-change"], artifact);
  }
  if (notesSource !== undefined) {
    if (!consume(remaining, "D", sourceNotes)) return invalid(input, ["unrecognized-tail-change"], artifact);
    if (notesDestination !== undefined && !consume(remaining, "A", destinationNotes)) {
      return invalid(input, ["unrecognized-tail-change"], artifact);
    }
  }

  const roadmap = ".arc/backlog/ROADMAP.md";
  if (remaining.has(roadmap) && !consume(remaining, "M", roadmap)) {
    return invalid(input, ["unrecognized-tail-change"], artifact);
  }
  for (const pair of cohortPairs(artifact, destination)) {
    if (!optionalPair(remaining, pair.source, pair.destination)) {
      return invalid(input, ["unrecognized-tail-change"], artifact);
    }
    if (!changes.some((change) => change.path === pair.source)) continue;
    const [sourceCohort, destinationCohort] = await Promise.all([
      showText(exec, input.reviewedThroughSha, pair.source),
      showText(exec, input.currentHeadSha, pair.destination),
    ]);
    if (sourceCohort === null || destinationCohort === null) return invalid(input, ["tail-unavailable"], artifact);
    if (!validCohortCloseout(sourceCohort, destinationCohort, slug)) {
      return invalid(input, ["unrecognized-tail-change"], artifact);
    }
  }

  const companions = new Map<string, { source?: string; destination?: string }>();
  for (const change of remaining.values()) {
    const sourcePrefix = companionPrefix(change.path, destination.directory, slug, true);
    const destinationPrefix = companionPrefix(change.path, destination.directory, slug, false);
    if (change.status === "D" && sourcePrefix !== null) {
      const candidate = companions.get(sourcePrefix) ?? {};
      if (candidate.source !== undefined) return invalid(input, ["unrecognized-tail-change"], artifact);
      candidate.source = change.path;
      companions.set(sourcePrefix, candidate);
      continue;
    }
    if (change.status === "A" && destinationPrefix !== null) {
      const candidate = companions.get(destinationPrefix) ?? {};
      if (candidate.destination !== undefined) return invalid(input, ["unrecognized-tail-change"], artifact);
      candidate.destination = change.path;
      companions.set(destinationPrefix, candidate);
      continue;
    }
    return invalid(input, ["unrecognized-tail-change"], artifact);
  }

  for (const companion of companions.values()) {
    if (companion.source === undefined || companion.destination === undefined) {
      return invalid(input, ["unrecognized-tail-change"], artifact);
    }
    const equality = await sameBlob(
      exec,
      input.reviewedThroughSha,
      companion.source,
      input.currentHeadSha,
      companion.destination,
    );
    if (equality === "unavailable") return invalid(input, ["tail-unavailable"], artifact);
    if (equality !== "same") return invalid(input, ["unrecognized-tail-change"], artifact);
  }

  return {
    schemaVersion: 1,
    predicateId: input.predicateId,
    reviewedThroughSha: input.reviewedThroughSha,
    currentHeadSha: input.currentHeadSha,
    baseRef: input.current.baseRef,
    diffBaseSha: input.current.diffBaseSha,
    policyVersion: input.current.policyVersion,
    rubricVersion: input.current.rubricVersion,
    sourceIdentity: input.current.sourceIdentity,
    artifact,
    diagnostics: [],
  };
}

/** Current in-repository Git implementation of the lifecycle-tail proof port. */
export class GitLifecycleTailProofAdapter implements LifecycleTailProofAdapter {
  private readonly exec: GitExec;

  constructor(options: GitLifecycleTailProofAdapterOptions) {
    this.exec = options.exec;
  }

  async resolveLifecycleTail(input: LifecycleTailProofResolutionInput): Promise<LifecycleTailProof | null> {
    try {
      return await classifyTail(this.exec, input);
    } catch {
      return invalid(input, ["tail-unavailable"]);
    }
  }
}
