/**
 * Exact-head, vehicle-aware lifecycle readiness over a caller-supplied tree.
 *
 * The checker reads only lifecycle products beneath the supplied root. It does
 * not infer state from the caller's checkout, Git refs, or fail-soft indexes.
 *
 * @module
 */

import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

import { parseMetaRecord } from "../../lib/active/meta-reader.js";
import { isErrandBranchType } from "../../lib/errand/branch-type.js";
import { branchToWorkUnitSlug } from "../../lib/work-unit/completed-index.js";
import { resolveLifecyclePosition } from "../../lib/work-unit/lifecycle-state.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const RepositorySchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
const ShaSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const PlanIdSchema = z.uuid();
const DeliverableIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const ReviewTargetSchema = z.strictObject({
  repository: RepositorySchema,
  pullRequest: z.number().int().positive(),
  headSha: ShaSchema,
});

export const LivePullRequestSchema = z.strictObject({
  repository: RepositorySchema,
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  headBranch: z.string().min(1),
  headSha: ShaSchema,
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
  isSymbolicLink(): boolean;
}

/** Minimal directory-entry shape used by the readiness filesystem boundary. */
export interface ReviewReadinessDirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Filesystem boundary for inspecting an untrusted worktree as data. */
export interface ReviewReadinessFs {
  lstat(path: string): Promise<ReviewReadinessStat>;
  realpath(path: string): Promise<string>;
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<ReviewReadinessDirEntry[]>;
}

/** Injectable boundaries for the readiness checker. */
export interface ReviewReadinessDependencies {
  fs: ReviewReadinessFs;
}

const DEFAULT_FS: ReviewReadinessFs = {
  lstat,
  realpath,
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

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function resolveRoot(
  requestedRoot: string,
  fs: ReviewReadinessFs,
): Promise<{ root?: string; fact?: ReviewReadinessFact }> {
  try {
    const requested = resolve(requestedRoot);
    const stat = await fs.lstat(requested);
    if (stat.isSymbolicLink()) {
      return { fact: fact("symlinked-root", requestedRoot, "The supplied tree root must not be a symbolic link.") };
    }
    if (!stat.isDirectory()) {
      return { fact: fact("non-directory-root", requestedRoot, "The supplied tree root is not a directory.") };
    }
    const root = await fs.realpath(requested);
    return { root };
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
  if (!isInside(root, candidate)) {
    return {
      path: relativePath,
      fact: fact("escaping-artifact", relativePath, "The required artifact path escapes the supplied tree."),
    };
  }
  let stat: ReviewReadinessStat;
  try {
    stat = await fs.lstat(candidate);
  } catch {
    return {
      path: relativePath,
      fact: fact("missing-artifact", relativePath, "The required artifact is missing."),
    };
  }
  if (stat.isSymbolicLink()) {
    return {
      path: relativePath,
      fact: fact("symlinked-artifact", relativePath, "The required artifact is a symbolic link."),
    };
  }
  if (!stat.isFile()) {
    return {
      path: relativePath,
      fact: fact("non-regular-artifact", relativePath, "The required artifact is not a regular file."),
    };
  }
  try {
    const canonical = await fs.realpath(candidate);
    if (!isInside(root, canonical)) {
      return {
        path: relativePath,
        fact: fact("escaping-artifact", relativePath, "The required artifact resolves outside the supplied tree."),
      };
    }
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
  if (!isInside(root, candidate)) {
    return { fact: fact("escaping-artifact", relativePath, "The required directory escapes the supplied tree.") };
  }
  try {
    const stat = await fs.lstat(candidate);
    if (stat.isSymbolicLink()) {
      return { fact: fact("symlinked-artifact", relativePath, "The required directory is a symbolic link.") };
    }
    if (!stat.isDirectory()) {
      return { fact: fact("non-regular-artifact", relativePath, "The required path is not a directory.") };
    }
    const canonical = await fs.realpath(candidate);
    if (!isInside(root, canonical)) {
      return {
        fact: fact("escaping-artifact", relativePath, "The required directory resolves outside the supplied tree."),
      };
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
  facts.push(...completionFacts(content, path));
  facts.push(...releaseNotesFacts(content, path));
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
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) {
        if (isMetaCandidate || recursive) {
          facts.push(fact("symlinked-artifact", child, "The lifecycle candidate is a symbolic link."));
        }
        continue;
      }
      if (stat.isDirectory()) {
        if (recursive) {
          const nested = await collectMetaPaths(root, child, fs, true);
          paths.push(...nested.paths);
          facts.push(...nested.facts);
        }
      } else if (isMetaCandidate && stat.isFile()) {
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
    await fs.lstat(resolve(root, coordinator));
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
  if (archive.candidates.length > 1) {
    return [fact(
      "duplicate-artifact",
      `.arc/completed/**/meta-${request.vehicle.slug}.md`,
      "The completed work-unit archive is ambiguous.",
    )];
  }
  const candidate = archive.candidates[0];
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
  facts.push(...completionFacts(content, candidate.metaPath));
  facts.push(...releaseNotesFacts(content, candidate.metaPath));
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
 * @param overrides - Test-only filesystem boundary override.
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
  if (request.vehicle.kind === "delivery-member") {
    return ready(request);
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
