/**
 * Exact-head, vehicle-aware lifecycle readiness over a caller-supplied tree.
 *
 * The checker reads lifecycle products beneath the supplied root. It does not
 * infer state from the caller's checkout or fail-soft indexes.
 *
 * A `delivery-member` vehicle adds two further authority sources, both outside
 * that root and both supplied by the caller's composition root: the delivery
 * lookup, which reads the Git-common delivery state of the repository that root
 * resolved, and an ancestry read relating the head a member records to the head
 * under review. Delivery state is repository-common rather than a tree product
 * and ancestry is a property of the object graph, so neither can come from the
 * request. No other vehicle reads outside the supplied root.
 *
 * The supplied checkout belongs to the attended operator. This reader checks
 * lifecycle completeness; it does not impose symlink, containment, or
 * duplicate-entry forensics on that checkout.
 *
 * That read is not side-effect-free. The underlying snapshot creates its
 * namespace directory and takes an advisory lock, so evaluating a member writes
 * inside the Git common directory. A sandbox denying those writes degrades the
 * member arm to `delivery-state-unavailable`, which is the fail-closed outcome
 * rather than a new failure mode — but the module's inspection-only posture
 * would misdescribe it if left unsaid.
 *
 * @module
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { z } from "zod";

import { parseMetaRecord } from "../../lib/active/meta-reader.js";
import { isErrandBranchType } from "../../lib/errand/branch-type.js";
import { branchToWorkUnitSlug } from "../../lib/work-unit/completed-index.js";
import {
  classifyPredecessorRelation,
  type AncestryAnswer,
} from "../../lib/delivery/predecessor-relation.js";
import { resolveLifecyclePosition } from "../../lib/work-unit/lifecycle-state.js";
import type { DeliveryMemberIdentityLookup } from "./core/delivery-member-lookup.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const RepositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
  .refine(
    (repository) => repository.split("/").every((segment) => /[^.]/u.test(segment)),
    "repository segments must not consist only of dots",
  );
const PlanIdSchema = z.uuid();
const DeliverableIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const ReviewTargetSchema = z.strictObject({
  repository: RepositorySchema,
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
});

export const LivePullRequestSchema = z.strictObject({
  repository: RepositorySchema,
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  headBranch: z.string().min(1),
  headSha: GitObjectIdSchema,
});

export const ReviewTreeRootSchema = z.string().min(1).refine(isAbsolute, "treeRoot must be absolute");

export const ReviewVehicleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("work-unit"),
    slug: SlugSchema,
    archiveCadence: z.enum(["with-integration", "manual"]),
  }),
  z.strictObject({
    kind: z.literal("errand"),
    slug: SlugSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-member"),
    planId: PlanIdSchema,
    deliverableId: DeliverableIdSchema,
    workUnitSlug: SlugSchema,
  }),
]);

export const ReviewReadinessRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
  target: ReviewTargetSchema,
  pullRequest: LivePullRequestSchema,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type ReviewReadinessRequest = z.infer<typeof ReviewReadinessRequestSchema>;

export const ReviewReadinessFactSchema = z.strictObject({
  code: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
}).readonly();
export type ReviewReadinessFact = z.infer<typeof ReviewReadinessFactSchema>;

const ReviewReadinessHeaderShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-readiness"),
  diagnostics: z.array(ReviewReadinessFactSchema).readonly(),
};

export const ReviewReadinessEnvelopeSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ReviewReadinessHeaderShape,
    state: z.literal("ready"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      target: ReviewTargetSchema,
      vehicle: ReviewVehicleSchema,
    }).readonly(),
  }),
  z.strictObject({
    ...ReviewReadinessHeaderShape,
    state: z.literal("invalid"),
    nextAction: z.literal("stop"),
    payload: z.strictObject({
      target: ReviewTargetSchema,
      vehicle: ReviewVehicleSchema,
      facts: z.array(ReviewReadinessFactSchema).min(1).readonly(),
    }).readonly(),
  }),
]);
export type ReviewReadinessEnvelope = z.infer<typeof ReviewReadinessEnvelopeSchema>;

/** Minimal stat shape used by the readiness filesystem boundary. */
export interface ReviewReadinessStat {
  isFile(): boolean;
  isDirectory(): boolean;
}

/** Minimal directory-entry shape used by the readiness filesystem boundary. */
export interface ReviewReadinessDirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Filesystem boundary for reading lifecycle products from an operator checkout. */
export interface ReviewReadinessFs {
  stat(path: string): Promise<ReviewReadinessStat>;
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<ReviewReadinessDirEntry[]>;
}

/** Injectable boundaries for the readiness checker. */
export interface ReviewReadinessDependencies {
  fs: ReviewReadinessFs;
  /**
   * Delivery read backing `delivery-member` authentication.
   *
   * No repository root reaches this module through its request, so the port has
   * no sound default and is supplied by each composition root from its own
   * resolved root. It is consequently optional here, and the member arm fails
   * closed as `delivery-state-unavailable` when it is absent. The `work-unit`
   * and `errand` arms never consult it.
   */
  deliveryMemberLookup?: DeliveryMemberIdentityLookup;
  /**
   * Ancestry between the head a member records and the head under review.
   *
   * Supplied by the same composition root as the lookup, for the same reason: no
   * repository reaches this module through its request. Its absence is not fatal,
   * because a member recording the head under review needs no read to be admitted
   * and one whose head moved cannot be admitted without one — so an absent reader
   * answers `unresolvable` and the movement simply stays unadmitted.
   */
  readDeliveryAncestry?(ancestor: string, descendant: string): Promise<AncestryAnswer>;
}

const DEFAULT_FS: ReviewReadinessFs = {
  stat,
  readFile: (path) => readFile(path, "utf8"),
  readdir: (path) => readdir(path, { withFileTypes: true }),
};

interface ReadResult {
  path: string;
  content?: string;
  fact?: ReviewReadinessFact;
}

interface ArchiveCandidate {
  directory: string;
  metaPath: string;
  quarter: string;
  sequence: string;
}

function fact(code: string, path: string, message: string): ReviewReadinessFact {
  return { code, path, message };
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function invalid(
  request: ReviewReadinessRequest,
  facts: readonly ReviewReadinessFact[],
): ReviewReadinessEnvelope {
  return ReviewReadinessEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-readiness",
    state: "invalid",
    nextAction: "stop",
    diagnostics: facts,
    payload: {
      target: request.target,
      vehicle: request.vehicle,
      facts,
    },
  });
}

function ready(request: ReviewReadinessRequest): ReviewReadinessEnvelope {
  return ReviewReadinessEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-readiness",
    state: "ready",
    nextAction: "none",
    diagnostics: [],
    payload: {
      target: request.target,
      vehicle: request.vehicle,
    },
  });
}

async function resolveRoot(
  requestedRoot: string,
  fs: ReviewReadinessFs,
): Promise<{ root?: string; fact?: ReviewReadinessFact }> {
  try {
    const requested = resolve(requestedRoot);
    const rootStat = await fs.stat(requested);
    if (!rootStat.isDirectory()) {
      return { fact: fact("non-directory-root", requestedRoot, "The supplied tree root is not a directory.") };
    }
    return { root: requested };
  } catch {
    return { fact: fact("missing-root", requestedRoot, "The supplied tree root is missing or unreadable.") };
  }
}

async function readRegularFile(
  root: string,
  relativePath: string,
  fs: ReviewReadinessFs,
): Promise<ReadResult> {
  const candidate = resolve(root, relativePath);
  let stat: ReviewReadinessStat;
  try {
    stat = await fs.stat(candidate);
  } catch {
    return {
      path: relativePath,
      fact: fact("missing-artifact", relativePath, "The required artifact is missing."),
    };
  }
  if (!stat.isFile()) {
    return {
      path: relativePath,
      fact: fact("non-regular-artifact", relativePath, "The required artifact is not a regular file."),
    };
  }
  try {
    return { path: relativePath, content: await fs.readFile(candidate) };
  } catch {
    return {
      path: relativePath,
      fact: fact("unreadable-artifact", relativePath, "The required artifact could not be read."),
    };
  }
}

async function readDirectory(
  root: string,
  relativePath: string,
  fs: ReviewReadinessFs,
): Promise<{ entries?: ReviewReadinessDirEntry[]; fact?: ReviewReadinessFact }> {
  const candidate = resolve(root, relativePath);
  try {
    const directoryStat = await fs.stat(candidate);
    if (!directoryStat.isDirectory()) {
      return { fact: fact("non-regular-artifact", relativePath, "The required path is not a directory.") };
    }
    return { entries: await fs.readdir(candidate) };
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? { fact: fact("missing-artifact", relativePath, "The required directory is missing.") }
      : { fact: fact("unreadable-artifact", relativePath, "The required directory is unreadable.") };
  }
}

function identityFacts(request: ReviewReadinessRequest): ReviewReadinessFact[] {
  const facts: ReviewReadinessFact[] = [];
  if (
    request.target.repository.toLowerCase() !== request.pullRequest.repository.toLowerCase()
    || request.target.pullRequest !== request.pullRequest.number
  ) {
    facts.push(fact(
      "pull-request-mismatch",
      "pullRequest",
      "The live pull request does not match the guarded repository and pull-request number.",
    ));
  }
  if (request.pullRequest.state !== "open") {
    facts.push(fact("pull-request-closed", "pullRequest.state", "The guarded pull request is not open."));
  }
  if (request.target.headSha !== request.pullRequest.headSha) {
    facts.push(fact("stale-head", "target.headSha", "The requested SHA is not the pull request's exact live head."));
  }
  if (
    request.vehicle.kind !== "delivery-member"
    && branchToWorkUnitSlug(request.pullRequest.headBranch) !== request.vehicle.slug
  ) {
    facts.push(fact(
      "vehicle-branch-mismatch",
      "pullRequest.headBranch",
      "The pull-request head branch does not encode the requested vehicle slug.",
    ));
  }
  if (request.vehicle.kind === "errand") {
    const [type, slug, ...tail] = request.pullRequest.headBranch.split("/");
    if (
      type === undefined
      || slug !== request.vehicle.slug
      || tail.length > 0
      || !isErrandBranchType(type)
    ) {
      facts.push(fact(
        "errand-branch-mismatch",
        "pullRequest.headBranch",
        "The pull-request head branch is not the exact branch projection of the requested Errand.",
      ));
    }
  }
  return facts;
}

function sectionBodies(content: string, heading: string): string[] {
  const lines = content.split(/\r?\n/u);
  const bodies: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== `## ${heading}`) continue;
    const body: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line === undefined || /^## /u.test(line)) break;
      body.push(line);
    }
    bodies.push(body.join("\n").trim());
  }
  return bodies;
}

function completionFacts(content: string, path: string): ReviewReadinessFact[] {
  const sections = sectionBodies(content, "Completion Notes");
  if (sections.length === 0) {
    return [fact("missing-completion-notes", path, "Completion Notes are required.")];
  }
  const body = sections[0]?.trim() ?? "";
  if (
    sections.length !== 1
    || body.length === 0
    || /^\[(?:none|tbd)\]$/iu.test(body)
    || containsOnlyHtmlComments(body)
  ) {
    return [fact("malformed-completion-notes", path, "Completion Notes must be unique and non-empty.")];
  }
  return [];
}

function containsOnlyHtmlComments(value: string): boolean {
  let cursor = 0;
  let comments = 0;
  while (cursor < value.length) {
    while (cursor < value.length && /\s/u.test(value[cursor] ?? "")) cursor += 1;
    if (cursor === value.length) return comments > 0;
    if (!value.startsWith("<!--", cursor)) return false;
    const end = value.indexOf("-->", cursor + 4);
    if (end === -1) return false;
    comments += 1;
    cursor = end + 3;
  }
  return comments > 0;
}

const RELEASE_NOTE_CATEGORIES = [
  "Added",
  "Changed",
  "Removed",
  "Fixed",
  "Infrastructure",
  "Deprecated",
  "Security",
] as const;

function releaseNotesFacts(content: string, path: string): ReviewReadinessFact[] {
  const sections = sectionBodies(content, "Release Notes Entry");
  if (sections.length === 0) return [];
  if (sections.length !== 1) {
    return [fact("malformed-release-notes", path, "Release Notes Entry must appear at most once.")];
  }
  const section = sections[0] ?? "";
  const lines = section.split(/\r?\n/u);
  const firstCategory = lines.findIndex((line) => /^### /u.test(line));
  if (firstCategory <= 0 || lines.slice(0, firstCategory).join("\n").trim().length === 0) {
    return [fact(
      "malformed-release-notes",
      path,
      "Release Notes Entry requires a summary followed by categorized changes.",
    )];
  }
  const seen = new Set<string>();
  let previousIndex = -1;
  let categorized = 0;
  for (let index = firstCategory; index < lines.length;) {
    const heading = /^### (.+)$/u.exec(lines[index] ?? "")?.[1];
    if (heading === undefined) {
      return [fact("malformed-release-notes", path, "Release Notes content must stay inside named categories.")];
    }
    const next = lines.findIndex((line, cursor) => cursor > index && /^### /u.test(line));
    const end = next === -1 ? lines.length : next;
    const body = lines.slice(index + 1, end).filter((line) => line.trim().length > 0);
    if (body.length === 0) {
      return [fact("malformed-release-notes", path, `Release Notes category '${heading}' is empty.`)];
    }
    if (heading === "Breaking Changes") {
      if (end !== lines.length || seen.has(heading)) {
        return [fact(
          "malformed-release-notes",
          path,
          "Breaking Changes may appear once, after the categorized changes.",
        )];
      }
      seen.add(heading);
      index = end;
      continue;
    }
    const categoryIndex = RELEASE_NOTE_CATEGORIES.indexOf(
      heading as (typeof RELEASE_NOTE_CATEGORIES)[number],
    );
    if (
      categoryIndex === -1
      || categoryIndex <= previousIndex
      || seen.has(heading)
      || !/^- \S/u.test(body[0] ?? "")
      || !body.every((line) => /^- \S/u.test(line) || /^\s{2,}\S/u.test(line))
    ) {
      return [fact(
        "malformed-release-notes",
        path,
        "Release Notes categories must be unique, ordered, supported, and contain non-empty list items.",
      )];
    }
    seen.add(heading);
    previousIndex = categoryIndex;
    categorized += 1;
    index = end;
  }
  if (categorized === 0) {
    return [fact("malformed-release-notes", path, "Release Notes Entry requires at least one change category.")];
  }
  return [];
}

/**
 * Collect the lifecycle-artifact facts a work-unit meta owes before merge: Completion
 * Notes are required, and a Release Notes Entry is validated whenever one is present.
 *
 * @param content - The work-unit meta's full text.
 * @param path - The meta's path, reported on each fact.
 * @returns One fact per unmet obligation; empty when the artifacts are satisfied.
 */
export function lifecycleArtifactFacts(content: string, path: string): ReviewReadinessFact[] {
  return [...completionFacts(content, path), ...releaseNotesFacts(content, path)];
}

async function evaluateDeliveryMember(
  request: ReviewReadinessRequest & {
    vehicle: { kind: "delivery-member"; planId: string; deliverableId: string; workUnitSlug: string };
  },
  lookup: DeliveryMemberIdentityLookup | undefined,
  readAncestry: ReviewReadinessDependencies["readDeliveryAncestry"],
): Promise<ReviewReadinessFact[]> {
  if (lookup === undefined) {
    return [fact(
      "delivery-state-unavailable",
      "pullRequest.headSha",
      "Delivery state is unavailable, so the member could not be authenticated.",
    )];
  }
  const resolution = await lookup.resolveMemberByIdentity({
    planId: request.vehicle.planId,
    deliverableId: request.vehicle.deliverableId,
    // One identity under two spellings: the vehicle names the work unit by slug and
    // the delivery record names it by id, so the hand-off renames rather than converts.
    workUnitId: request.vehicle.workUnitSlug,
  });
  if (resolution.status === "unavailable") {
    return [fact(
      "delivery-state-unavailable",
      "pullRequest.headSha",
      "Delivery state is unavailable, so the member could not be authenticated.",
    )];
  }
  // Each miss is cleared by a different act, so each names its own: one shared code could only carry a
  // remedy directing two of the three at inputs that never reach what failed.
  if (resolution.status === "no-plan") {
    return [fact(
      "delivery-plan-absent",
      "vehicle.workUnitSlug",
      "No delivery plan carries the asserted work unit. Reserve one for it, or review this change under "
      + "the work unit's own vehicle.",
    )];
  }
  if (resolution.status === "plan-mismatch") {
    return [fact(
      "delivery-plan-mismatch",
      "vehicle.planId",
      "The work unit's delivery plan is not the asserted plan. Re-read the plan id from the current "
      + "delivery plan and resubmit.",
    )];
  }
  if (resolution.status === "not-in-plan") {
    return [fact(
      "delivery-member-not-in-plan",
      "vehicle.deliverableId",
      "The resolved delivery plan does not carry the asserted deliverable. Re-read the deliverable id "
      + "from the plan's members and resubmit.",
    )];
  }
  if (resolution.status === "in-plan-unbound") {
    return [fact(
      "delivery-member-unbound",
      "pullRequest.headSha",
      "The delivery plan carries this member, and no binding records a head for it.",
    )];
  }
  const member = resolution.member;
  const facts: ReviewReadinessFact[] = [];
  const relation = classifyPredecessorRelation({
    boundHead: member.head,
    observedHead: request.pullRequest.headSha,
    boundIsAncestorOfObserved: readAncestry === undefined
      ? "unresolvable"
      : await readAncestry(member.head, request.pullRequest.headSha),
    // Only the append-only advance is admissible here, so the reverse direction is
    // never read. Leaving it unestablished also keeps `diverged` unreachable, which
    // is the one variant carrying the cardinality below, so no count is ever read.
    observedIsAncestorOfBound: "unresolvable",
    mergeBaseCount: 1,
  });
  if (relation.kind !== "unchanged" && relation.kind !== "advanced") {
    facts.push(fact(
      "delivery-member-stale",
      "pullRequest.headSha",
      "The member's recorded head is not the head under review, and the head under review does not "
      + "descend from it.",
    ));
  }
  if (member.isFinalMember) {
    facts.push(fact(
      "delivery-member-terminal",
      "vehicle.deliverableId",
      "The plan's final member reviews under its work unit's own vehicle.",
    ));
  }
  return facts;
}

async function evaluateManualWorkUnit(
  request: ReviewReadinessRequest & { vehicle: { kind: "work-unit"; slug: string; archiveCadence: "manual" } },
  root: string,
  fs: ReviewReadinessFs,
): Promise<ReviewReadinessFact[]> {
  const path = `.arc/active/meta-${request.vehicle.slug}.md`;
  const result = await readRegularFile(root, path, fs);
  if (result.fact !== undefined) return [result.fact];
  const content = result.content ?? "";
  let record;
  try {
    record = parseMetaRecord(content);
  } catch {
    return [fact("malformed-artifact", path, "The active work-unit meta is malformed.")];
  }
  const position = resolveLifecyclePosition({ path, state: record.state });
  if (position?.phase !== "Integrating" || position.location !== "active") {
    return [fact(
      "wrong-cadence",
      path,
      "Manual cadence requires an Integrating work-unit meta under .arc/active.",
    )];
  }
  const facts: ReviewReadinessFact[] = [];
  if (record.branch !== request.pullRequest.headBranch) {
    facts.push(fact(
      "branch-mismatch",
      path,
      "The active work-unit meta branch does not match the pull-request head branch.",
    ));
  }
  facts.push(...lifecycleArtifactFacts(content, path));
  return facts;
}

async function findArchiveCandidates(
  root: string,
  slug: string,
  fs: ReviewReadinessFs,
): Promise<{ candidates: ArchiveCandidate[]; facts: ReviewReadinessFact[] }> {
  const completed = await readDirectory(root, ".arc/completed", fs);
  if (completed.entries === undefined) {
    return { candidates: [], facts: [completed.fact ?? fact(
      "missing-artifact",
      ".arc/completed",
      "The completed archive is missing.",
    )] };
  }
  const candidates: ArchiveCandidate[] = [];
  const facts: ReviewReadinessFact[] = [];
  for (const quarterEntry of completed.entries) {
    if (!/^\d{4}-q[1-4]$/u.test(quarterEntry.name)) continue;
    const quarterPath = `.arc/completed/${quarterEntry.name}`;
    const quarter = await readDirectory(root, quarterPath, fs);
    if (quarter.entries === undefined) {
      facts.push(quarter.fact ?? fact("unreadable-artifact", quarterPath, "The archive quarter is unreadable."));
      continue;
    }
    for (const archiveEntry of quarter.entries) {
      const match = new RegExp(`^([0-9]+)_${escapeRegExp(slug)}$`, "u").exec(archiveEntry.name);
      if (match === null) continue;
      const directory = `${quarterPath}/${archiveEntry.name}`;
      const archive = await readDirectory(root, directory, fs);
      if (archive.entries === undefined) {
        facts.push(archive.fact ?? fact("non-regular-artifact", directory, "The work-unit archive is invalid."));
        continue;
      }
      candidates.push({
        directory,
        metaPath: `${directory}/meta-${slug}.md`,
        quarter: quarterEntry.name,
        sequence: match[1] ?? "",
      });
    }
  }
  return { candidates, facts };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function archivedPrUrlMatches(value: string | null, repository: string, pullRequest: number): boolean {
  if (value === null) return false;
  try {
    const url = new URL(value);
    const expectedPath = `/${repository}/pull/${pullRequest}`.toLowerCase();
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === "github.com"
      && url.pathname.replace(/\/$/u, "").toLowerCase() === expectedPath
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

async function collectMetaPaths(
  root: string,
  relativePath: string,
  fs: ReviewReadinessFs,
  recursive: boolean,
): Promise<{ paths: string[]; facts: ReviewReadinessFact[] }> {
  const directory = await readDirectory(root, relativePath, fs);
  if (directory.entries === undefined) {
    return directory.fact?.code === "missing-artifact"
      ? { paths: [], facts: [] }
      : {
        paths: [],
        facts: [directory.fact ?? fact(
          "unreadable-artifact",
          relativePath,
          "The lifecycle directory is unreadable.",
        )],
      };
  }
  const paths: string[] = [];
  const facts: ReviewReadinessFact[] = [];
  for (const entry of directory.entries) {
    const child = `${relativePath}/${entry.name}`;
    const absolute = resolve(root, child);
    const isMetaCandidate = /^meta-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u.test(entry.name);
    try {
      const candidateStat = await fs.stat(absolute);
      if (candidateStat.isDirectory()) {
        if (recursive) {
          const nested = await collectMetaPaths(root, child, fs, true);
          paths.push(...nested.paths);
          facts.push(...nested.facts);
        }
      } else if (isMetaCandidate && candidateStat.isFile()) {
        paths.push(child);
      } else if (isMetaCandidate) {
        facts.push(fact("non-regular-artifact", child, "The lifecycle candidate is not a regular file."));
      }
    } catch {
      facts.push(fact("unreadable-artifact", child, "The lifecycle entry could not be inspected."));
    }
  }
  return { paths, facts };
}

async function lifecycleCandidateFacts(
  root: string,
  fs: ReviewReadinessFs,
): Promise<ReviewReadinessFact[]> {
  const roots: Array<{ path: string; recursive: boolean }> = [
    { path: ".arc/active", recursive: false },
    { path: ".arc/backlog/planned", recursive: true },
    { path: ".arc/backlog/provisional", recursive: true },
    { path: ".arc/completed", recursive: true },
  ];
  const facts: ReviewReadinessFact[] = [];
  for (const source of roots) {
    const collected = await collectMetaPaths(root, source.path, fs, source.recursive);
    facts.push(...collected.facts);
    for (const path of collected.paths) {
      const result = await readRegularFile(root, path, fs);
      if (result.fact !== undefined) {
        facts.push(result.fact);
        continue;
      }
      try {
        const record = parseMetaRecord(result.content ?? "");
        if (resolveLifecyclePosition({ path, state: record.state }) === null) {
          facts.push(fact("malformed-artifact", path, "The lifecycle candidate is malformed."));
        }
      } catch {
        facts.push(fact("malformed-artifact", path, "The lifecycle candidate is malformed."));
      }
    }
  }
  return facts;
}

async function hasOpenCohortMember(
  root: string,
  cohort: string,
  fs: ReviewReadinessFs,
): Promise<{ open: boolean; facts: ReviewReadinessFact[] }> {
  const roots: Array<{ path: string; recursive: boolean }> = [
    { path: ".arc/active", recursive: false },
    { path: ".arc/backlog/planned", recursive: true },
    { path: ".arc/backlog/provisional", recursive: true },
  ];
  for (const source of roots) {
    const collected = await collectMetaPaths(root, source.path, fs, source.recursive);
    if (collected.facts.length > 0) return { open: false, facts: collected.facts };
    for (const path of collected.paths) {
      const result = await readRegularFile(root, path, fs);
      if (result.content === undefined) {
        if (result.fact !== undefined) return { open: false, facts: [result.fact] };
        continue;
      }
      try {
        const record = parseMetaRecord(result.content);
        if (resolveLifecyclePosition({ path, state: record.state }) === null) {
          return {
            open: false,
            facts: [fact("malformed-artifact", path, "The lifecycle candidate is malformed.")],
          };
        }
        const memberCohort = record.cohort;
        if (memberCohort === cohort || memberCohort?.startsWith(`${cohort}/`) === true) {
          return { open: true, facts: [] };
        }
      } catch {
        return {
          open: false,
          facts: [fact("malformed-artifact", path, "The lifecycle candidate is malformed.")],
        };
      }
    }
  }
  return { open: false, facts: [] };
}

function validCohortCloseout(content: string, slug: string): boolean {
  const sections = sectionBodies(content, "Closeout");
  if (sections.length !== 1) return false;
  const body = sections[0] ?? "";
  return /^- \*\*Closed:\*\* \d{4}-\d{2}-\d{2}$/mu.test(body)
    && new RegExp(`^- \\*\\*Final member:\\*\\* \`${escapeRegExp(slug)}\`$`, "mu").test(body)
    && /^- \*\*Member archives:\*\* \S.+$/mu.test(body)
    && /^- \*\*Outcome:\*\* \S.+$/mu.test(body)
    && /^- \*\*Follow-up:\*\* \S.+$/mu.test(body);
}

async function cohortCoordinateFacts(
  root: string,
  fs: ReviewReadinessFs,
  candidate: ArchiveCandidate,
  coordinate: string,
  closeoutSuffix: "a" | "b",
  finalSlug: string,
): Promise<ReviewReadinessFact[]> {
  const leaf = coordinate.split("/").at(-1);
  if (leaf === undefined) {
    return [fact("malformed-artifact", candidate.metaPath, "The archived cohort coordinate is malformed.")];
  }
  const coordinator = `.arc/backlog/planned/${coordinate}/cohort-${leaf}.md`;
  const openMembers = await hasOpenCohortMember(root, coordinate, fs);
  if (openMembers.facts.length > 0) return openMembers.facts;
  if (openMembers.open) {
    const active = await readRegularFile(root, coordinator, fs);
    if (active.fact === undefined) return [];
    return active.fact.code === "missing-artifact"
      ? [fact(
          "missing-cohort-coordination",
          coordinator,
          "An open cohort still requires its planned coordination document.",
        )]
      : [active.fact];
  }
  try {
    await fs.stat(resolve(root, coordinator));
    return [fact(
      "incomplete-cohort-closeout",
      coordinator,
      "The final cohort member shipped but its planned coordination document remains.",
    )];
  } catch {
    // Absence is the expected final-member shape.
  }
  const closeout =
    `.arc/completed/${candidate.quarter}/${candidate.sequence}${closeoutSuffix}_cohort-${leaf}/cohort-${leaf}.md`;
  const result = await readRegularFile(root, closeout, fs);
  if (result.content === undefined) {
    return result.fact?.code === "missing-artifact"
      ? [fact(
          "missing-cohort-closeout",
          closeout,
          "The final cohort member requires its completed closeout sidecar.",
        )]
      : [result.fact ?? fact("missing-cohort-closeout", closeout, "The cohort closeout is unavailable.")];
  }
  return validCohortCloseout(result.content, finalSlug)
    ? []
    : [fact("malformed-cohort-closeout", closeout, "The cohort closeout section is malformed.")];
}

async function cohortCloseoutFacts(
  root: string,
  fs: ReviewReadinessFs,
  candidate: ArchiveCandidate,
  cohort: string | null,
  finalSlug: string,
): Promise<ReviewReadinessFact[]> {
  if (cohort === null || cohort === "[none]" || cohort.trim() === "") return [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/u.test(cohort)) {
    return [fact("malformed-artifact", candidate.metaPath, "The archived cohort coordinate is malformed.")];
  }
  const facts = await cohortCoordinateFacts(root, fs, candidate, cohort, "a", finalSlug);
  const parent = cohort.includes("/") ? cohort.split("/")[0] : undefined;
  if (parent !== undefined) {
    facts.push(...await cohortCoordinateFacts(root, fs, candidate, parent, "b", finalSlug));
  }
  return facts;
}

async function evaluateArchivedWorkUnit(
  request: ReviewReadinessRequest & {
    vehicle: { kind: "work-unit"; slug: string; archiveCadence: "with-integration" };
  },
  root: string,
  fs: ReviewReadinessFs,
): Promise<ReviewReadinessFact[]> {
  const archive = await findArchiveCandidates(root, request.vehicle.slug, fs);
  if (archive.facts.length > 0) return archive.facts;
  if (archive.candidates.length === 0) {
    return [fact(
      "missing-artifact",
      `.arc/completed/**/meta-${request.vehicle.slug}.md`,
      "The completed work-unit archive is missing.",
    )];
  }
  const candidate = [...archive.candidates].sort((left, right) => (
    left.quarter === right.quarter
      ? Number(left.sequence) - Number(right.sequence)
      : left.quarter.localeCompare(right.quarter)
  )).at(-1);
  if (candidate === undefined) return [];
  const result = await readRegularFile(root, candidate.metaPath, fs);
  if (result.fact !== undefined) return [result.fact];
  const content = result.content ?? "";
  let record;
  try {
    record = parseMetaRecord(content);
  } catch {
    return [fact("malformed-artifact", candidate.metaPath, "The archived work-unit meta is malformed.")];
  }
  const position = resolveLifecyclePosition({ path: candidate.metaPath, state: record.state });
  if (position?.phase !== "Shipped" || position.location !== "completed") {
    return [fact(
      "wrong-cadence",
      candidate.metaPath,
      "With-integration cadence requires a Shipped work-unit meta under .arc/completed.",
    )];
  }
  const facts: ReviewReadinessFact[] = [];
  if (record.branch !== null) {
    facts.push(fact("branch-mismatch", candidate.metaPath, "The archived work-unit branch must be cleared."));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(record.completed ?? "")) {
    facts.push(fact("malformed-artifact", candidate.metaPath, "The archived completion date is missing or malformed."));
  }
  if (!archivedPrUrlMatches(
    record.prUrl,
    request.target.repository,
    request.target.pullRequest,
  )) {
    facts.push(fact(
      "pr-url-mismatch",
      candidate.metaPath,
      "The archived PR URL does not name the guarded repository and pull request.",
    ));
  }
  facts.push(...lifecycleArtifactFacts(content, candidate.metaPath));
  facts.push(...await lifecycleCandidateFacts(root, fs));
  if (facts.length === 0) {
    facts.push(...await cohortCloseoutFacts(root, fs, candidate, record.cohort, request.vehicle.slug));
  }
  return facts;
}

/**
 * Evaluate lifecycle readiness for one exact guarded head.
 *
 * @param input - Strict request naming the supplied tree, live PR, and vehicle.
 * @param overrides - Injected boundaries. The filesystem boundary is test-only;
 *   the delivery lookup is the production injection path for member
 *   authentication and is supplied by each composition root.
 * @returns A ready or structured-invalid review envelope.
 */
export async function evaluateReviewReadiness(
  input: ReviewReadinessRequest,
  overrides: Partial<ReviewReadinessDependencies> = {},
): Promise<ReviewReadinessEnvelope> {
  const request = ReviewReadinessRequestSchema.parse(input);
  const fs = overrides.fs ?? DEFAULT_FS;
  const facts = identityFacts(request);
  if (facts.length > 0) return invalid(request, facts);

  const resolved = await resolveRoot(request.treeRoot, fs);
  if (resolved.fact !== undefined || resolved.root === undefined) {
    return invalid(request, [resolved.fact ?? fact("missing-root", request.treeRoot, "The supplied root is invalid.")]);
  }

  if (request.vehicle.kind === "errand") {
    return ready(request);
  }
  // A member pull request carries no lifecycle artifacts, so nothing beneath the
  // root is read on this path. The resolution above is still load bearing: it is
  // itself the check that an unusable supplied root refuses consistently across
  // every vehicle kind, so this arm must stay below it.
  if (request.vehicle.kind === "delivery-member") {
    const memberFacts = await evaluateDeliveryMember(
      request as ReviewReadinessRequest & {
        vehicle: { kind: "delivery-member"; planId: string; deliverableId: string; workUnitSlug: string };
      },
      overrides.deliveryMemberLookup,
      overrides.readDeliveryAncestry,
    );
    return memberFacts.length === 0 ? ready(request) : invalid(request, memberFacts);
  }
  if (request.vehicle.archiveCadence === "with-integration") {
    const productFacts = await evaluateArchivedWorkUnit(
      request as ReviewReadinessRequest & {
        vehicle: { kind: "work-unit"; slug: string; archiveCadence: "with-integration" };
      },
      resolved.root,
      fs,
    );
    return productFacts.length === 0 ? ready(request) : invalid(request, productFacts);
  }
  const productFacts = await evaluateManualWorkUnit(
    request as ReviewReadinessRequest & {
      vehicle: { kind: "work-unit"; slug: string; archiveCadence: "manual" };
    },
    resolved.root,
    fs,
  );
  return productFacts.length === 0 ? ready(request) : invalid(request, productFacts);
}
