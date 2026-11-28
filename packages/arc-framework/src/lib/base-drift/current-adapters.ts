/**
 * Current repository-backed semantic adapters for base-drift analysis.
 *
 * @module
 */

import { parseMetaRecord } from "../active/meta-reader.js";
import {
  classifyPathTreatment,
  type PathTreatmentContext,
} from "../evidence-applicability/index.js";
import type {
  BaseDriftCommitInput,
  IntegrationEvidenceResolver,
  IntegrationEvidenceResolverFactory,
  IntegrationIdentity,
  PathTreatmentClassifier,
  ResolverEvent,
  ResolverRead,
} from "../git/base-drift-types.js";
import type { GitExec } from "../git/exec.js";
import {
  readCompletedEvidenceFromRef,
  type CompletedEvidenceRead,
  type ShippedWorkUnitRecord,
} from "../work-unit/completed-index.js";
import { resolveCandidateRecordRelativePath, resolveSubmissionBoundaryPath } from "../store/kinds/review/paths.js";
import type { Store } from "../store/contract.js";
import { readStoreCompletedEvidenceByIdentity } from "../store/lifecycle-completed.js";

export interface CurrentBaseDriftAdapters {
  resolverFactory: IntegrationEvidenceResolverFactory;
  classifyReconciliation: PathTreatmentClassifier;
}

/** Construct explicit identity and projection coordinates for one work unit. */
export function workUnitPathTreatmentContext(workUnit: string): PathTreatmentContext {
  return {
    workUnit,
    projectionPaths: new Set([
      resolveCandidateRecordRelativePath(workUnit),
      resolveSubmissionBoundaryPath(workUnit),
    ]),
  };
}

/**
 * Bind current completed-record and readiness-projection adapters.
 *
 * @param exec - Git executor over the checkout.
 * @param store - The caller's store. With state off the branch, integrations are named from its completed records,
 *   since no completed meta lands on base.
 * @param treatmentContext - Work-unit and projection coordinates for path treatment.
 */
export function createCurrentBaseDriftAdapters(
  exec: GitExec,
  store: Store,
  treatmentContext: PathTreatmentContext = {},
): CurrentBaseDriftAdapters {
  return {
    resolverFactory: (baseOid) => store.capabilities.stateOffBranch
      ? createStoreCompletedResolver(store)
      : createCompletedMetaResolver(exec, baseOid),
    classifyReconciliation: (path) => classifyPathTreatment(path, treatmentContext),
  };
}

/**
 * Name each integration from the store's completed records by the pull request number in an archived meta's
 * `PR URL`. A number two archived metas name resolves to no work unit, as one no archived meta names does.
 *
 * @param store - A store keeping state off the branch.
 * @returns A resolver that reads the completed records once, at its first event.
 */
export function createStoreCompletedResolver(store: Store): IntegrationEvidenceResolver {
  let archiveRead: Promise<CompletedEvidenceRead> | undefined;
  const archive = (): Promise<CompletedEvidenceRead> => archiveRead ??= readStoreCompletedEvidenceByIdentity(store);
  const read = <T>(value: T, completed: CompletedEvidenceRead): ResolverRead<T> =>
    resolverRead(value, completed, completed.status === "unavailable");

  return {
    async enrichTopologyEvent(event) {
      const completed = await archive();
      const byPr = event.prNumber === undefined ? null : uniqueRecordByPr(completed, event.prNumber);
      return read(byPr === null ? null : identityOf(byPr), completed);
    },

    async proveSingleParentEvents(inputs) {
      const completed = await archive();
      const events: ResolverEvent[] = [];
      for (const input of inputs) {
        if (input.acceptedPrNumber === undefined) continue;
        const record = uniqueRecordByPr(completed, input.acceptedPrNumber);
        if (record !== null) events.push({ commits: [input.oid], ...identityOf(record) });
      }
      return read(events, completed);
    },
  };
}

export function createCompletedMetaResolver(
  exec: GitExec,
  baseOid: string,
): IntegrationEvidenceResolver {
  const archiveRead = readCompletedEvidenceFromRef(exec, baseOid);

  return {
    async enrichTopologyEvent(event, input) {
      const [archive, additions] = await Promise.all([
        archiveRead,
        readAddedCompletedMetas(exec, input),
      ]);
      const [onlyAddition] = additions.status === "available" ? additions.records : [];
      const sameCommit = additions.status === "available"
        && additions.records.length === 1
        && onlyAddition !== undefined
        && (
          event.prNumber === undefined
          || onlyAddition.prNumber === null
          || onlyAddition.prNumber === event.prNumber
        )
        ? identityOf(onlyAddition)
        : null;
      const byPr = event.prNumber === undefined
        ? null
        : uniqueRecordByPr(archive, event.prNumber);
      const identity = byPr === null ? sameCommit : identityOf(byPr);
      return resolverRead(identity, archive, additions.status === "unavailable");
    },

    async proveSingleParentEvents(inputs) {
      const archive = await archiveRead;
      const events: ResolverEvent[] = [];
      let historyUnavailable = false;
      for (const input of inputs) {
        if (input.acceptedPrNumber === undefined) continue;
        const additions = await readAddedCompletedMetas(exec, input);
        if (additions.status === "unavailable") {
          historyUnavailable = true;
          continue;
        }
        if (additions.records.length !== 1) continue;
        const record = additions.records[0];
        if (record === undefined) continue;
        if (record.prNumber !== input.acceptedPrNumber) continue;
        events.push({ commits: [input.oid], ...identityOf(record) });
      }
      return resolverRead(events, archive, historyUnavailable);
    },
  };
}

type AddedMetaRead =
  | { status: "available"; records: ShippedWorkUnitRecord[] }
  | { status: "unavailable" };

async function readAddedCompletedMetas(
  exec: GitExec,
  input: BaseDriftCommitInput,
): Promise<AddedMetaRead> {
  const parent = input.parents[0];
  if (parent === undefined) return { status: "available", records: [] };
  let paths: string[];
  try {
    const { stdout } = await exec("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-status",
      "-z",
      "--no-renames",
      "-r",
      parent,
      input.oid,
      "--",
      ".arc/completed/",
    ]);
    paths = parseAddedMetaPaths(stdout);
  } catch {
    return { status: "unavailable" };
  }

  const records: ShippedWorkUnitRecord[] = [];
  for (const path of paths) {
    try {
      const { stdout } = await exec("git", ["show", `${input.oid}:${path}`]);
      const record = recordFromMeta(path, stdout);
      if (record === null) return { status: "unavailable" };
      records.push(record);
    } catch {
      return { status: "unavailable" };
    }
  }
  return { status: "available", records };
}

function parseAddedMetaPaths(stdout: string): string[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) throw new Error("Malformed completed-meta status framing.");
  const fields = stdout.slice(0, -1).split("\0");
  if (fields.length % 2 !== 0) throw new Error("Malformed completed-meta status record.");
  const paths: string[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (status !== "A" || path === undefined) continue;
    if (completedMetaSlug(path) !== null) paths.push(path);
  }
  return paths;
}

function recordFromMeta(path: string, content: string): ShippedWorkUnitRecord | null {
  const slug = completedMetaSlug(path);
  if (slug === null) return null;
  let meta;
  try {
    meta = parseMetaRecord(content);
  } catch {
    return null;
  }
  const completedValue = meta.completed?.trim();
  const completedAt = completedValue === undefined
    || Number.isNaN(Date.parse(completedValue))
    ? null
    : completedValue;
  const prValue = meta.prUrl?.trim();
  const match = prValue === undefined
    ? null
    : /^(https?:\/\/[^\s]+\/pull\/([1-9]\d*))$/u.exec(prValue);
  const prNumber = match === null ? null : Number(match[2]);
  return {
    slug,
    completedAt,
    prUrl: match?.[1] ?? null,
    prNumber: Number.isSafeInteger(prNumber) ? prNumber : null,
  };
}

function completedMetaSlug(path: string): string | null {
  const match = /^\.arc\/completed\/[^/]+\/\d+_([^/]+)\/meta-([^/]+)\.md$/u.exec(path);
  const slug = match?.[1];
  return slug !== undefined && slug === match?.[2] ? slug : null;
}

function identityOf(record: ShippedWorkUnitRecord): IntegrationIdentity {
  return {
    slug: record.slug,
    ...(record.prNumber === null ? {} : { prNumber: record.prNumber }),
    ...(record.prUrl === null ? {} : { prUrl: record.prUrl }),
  };
}

function uniqueRecordByPr(
  archive: CompletedEvidenceRead,
  prNumber: number,
): ShippedWorkUnitRecord | null {
  if (archive.status !== "available") return null;
  const matches = [...archive.records.values()].filter((record) => record.prNumber === prNumber);
  const [match] = matches;
  return matches.length === 1 && match !== undefined ? match : null;
}

function resolverRead<T>(
  value: T,
  archive: CompletedEvidenceRead,
  historyUnavailable: boolean,
): ResolverRead<T> {
  if (archive.status === "available" && !historyUnavailable) return { status: "available", value };
  if (archive.status === "unavailable" && historyUnavailable) return { status: "unavailable" };
  return { status: "partial", value };
}
