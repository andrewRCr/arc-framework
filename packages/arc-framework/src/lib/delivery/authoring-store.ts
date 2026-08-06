/** Repository-common storage for one canonical snapshot and its editable Markdown map. */

import type {
  GitCommonStateSnapshotEntry,
  GitCommonStateTransactionPublisher,
} from "../git-common-state.js";
import { canonicalize, SlugSchema } from "../kernel/index.js";
import type { ReachableReferenceTransition } from "../work-unit/reference-reconcile.js";
import {
  DeliveryAuthoringSnapshotV1Schema,
  type DeliveryAuthoringCandidateOutcomeV1,
  type DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";
import { resolveForwardDeliverySubjectFromTransitions } from "./plan-resolution.js";

const AUTHORING_LOCATION = { root: "delivery", namespace: "authoring" } as const;

/** One complete authoring pair. */
export interface DeliveryAuthoringPair {
  readonly snapshot: DeliveryAuthoringSnapshotV1;
  readonly markdown: string;
}

/** Enumerated authoring state; Markdown may be absent after publication cleanup starts. */
export interface DeliveryAuthoringRecord {
  readonly snapshot: DeliveryAuthoringSnapshotV1;
  readonly markdown: string | null;
}

/** Closed failures at the paired authoring-state boundary. */
export type DeliveryAuthoringStoreFailure =
  | "authoring-state-exists"
  | "authoring-state-corrupt"
  | "ambiguous-subject"
  | "identity-mismatch"
  | "namespace-corrupt"
  | "record-malformed"
  | "version-conflict";

/** Result of one paired authoring-state operation. */
export type DeliveryAuthoringStoreResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "refused"; readonly reason: DeliveryAuthoringStoreFailure };

/** Storage contract consumed by singleton resolution and command handlers. */
export interface DeliveryAuthoringStore {
  create(pair: DeliveryAuthoringPair): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>>;
  createResolved(input: {
    readonly pair: DeliveryAuthoringPair;
    readonly currentWorkUnitId: string;
    readonly transitions: readonly ReachableReferenceTransition[];
  }): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>>;
  enumerate(): Promise<DeliveryAuthoringStoreResult<readonly DeliveryAuthoringRecord[]>>;
  abandon(mapId: string): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>>;
}

/** Mutations used by composition's receipt-first, JSON-last publication sequence. */
export interface DeliveryAuthoringCompositionStore {
  recordCandidate(
    mapId: string,
    expected: DeliveryAuthoringSnapshotV1,
    candidatePlanDigest: string,
    candidateProjectionDigest: string,
    candidateOutcome: DeliveryAuthoringCandidateOutcomeV1,
  ): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringSnapshotV1>>;
  deleteMarkdown(mapId: string): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>>;
  deleteSnapshot(mapId: string): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>>;
}

function recordNames(mapId: string): { readonly json: string; readonly markdown: string } {
  return { json: `${mapId}.json`, markdown: `${mapId}.md` };
}

function decodeSnapshot(raw: string, mapId: string): DeliveryAuthoringStoreResult<DeliveryAuthoringSnapshotV1> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "refused", reason: "record-malformed" };
  }
  const parsed = DeliveryAuthoringSnapshotV1Schema.safeParse(value);
  if (!parsed.success) return { status: "refused", reason: "record-malformed" };
  if (parsed.data.mapId !== mapId) return { status: "refused", reason: "identity-mismatch" };
  return { status: "ok", value: parsed.data };
}

function decodeRecords(
  entries: readonly GitCommonStateSnapshotEntry[],
): DeliveryAuthoringStoreResult<readonly DeliveryAuthoringRecord[]> {
  const grouped = new Map<string, { json?: string; markdown?: string }>();
  for (const entry of entries) {
    if (entry.kind !== "file") return { status: "refused", reason: "authoring-state-corrupt" };
    const match = /^(?<mapId>.+)\.(?<extension>json|md)$/u.exec(entry.name);
    const parsedMapId = SlugSchema.safeParse(match?.groups?.mapId);
    const extension = match?.groups?.extension;
    if (!parsedMapId.success || (extension !== "json" && extension !== "md")) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    const record = grouped.get(parsedMapId.data) ?? {};
    if (extension === "json") record.json = entry.content;
    else record.markdown = entry.content;
    grouped.set(parsedMapId.data, record);
  }

  const records: DeliveryAuthoringRecord[] = [];
  for (const [mapId, record] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    if (record.json === undefined) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    const decoded = decodeSnapshot(record.json, mapId);
    if (decoded.status === "refused") return decoded;
    records.push({ snapshot: decoded.value, markdown: record.markdown ?? null });
  }
  return { status: "ok", value: records };
}

/** Namespace-locked adapter preserving the JSON/Markdown pair as one logical record. */
export class RepositoryDeliveryAuthoringStore implements DeliveryAuthoringStore, DeliveryAuthoringCompositionStore {
  constructor(private readonly publisher: GitCommonStateTransactionPublisher) {}

  async create(pair: DeliveryAuthoringPair): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>> {
    const parsed = DeliveryAuthoringSnapshotV1Schema.safeParse(pair.snapshot);
    if (!parsed.success || pair.markdown.length === 0) {
      return { status: "refused", reason: "record-malformed" };
    }
    const names = recordNames(parsed.data.mapId);
    return this.publisher.transact<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>>(
      AUTHORING_LOCATION,
      [names.json, names.markdown],
      (current) => {
        if (current.get(names.json) !== null || current.get(names.markdown) !== null) {
          return {
            mutations: [],
            result: { status: "refused", reason: "authoring-state-exists" } as const,
          };
        }
        const stored = { snapshot: parsed.data, markdown: pair.markdown };
        return {
          mutations: [
            { recordName: names.json, kind: "write", content: `${canonicalize(parsed.data)}\n` },
            { recordName: names.markdown, kind: "write", content: pair.markdown },
          ],
          result: { status: "ok", value: stored } as const,
        };
      },
    );
  }

  async createResolved(input: {
    readonly pair: DeliveryAuthoringPair;
    readonly currentWorkUnitId: string;
    readonly transitions: readonly ReachableReferenceTransition[];
  }): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>> {
    const parsed = DeliveryAuthoringSnapshotV1Schema.safeParse(input.pair.snapshot);
    if (!parsed.success || input.pair.markdown.length === 0) {
      return { status: "refused", reason: "record-malformed" };
    }
    if (parsed.data.originalWorkUnitId !== input.currentWorkUnitId) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    const names = recordNames(parsed.data.mapId);
    return this.publisher.transactSnapshot<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>>(
      AUTHORING_LOCATION,
      (current) => {
        const records = decodeRecords(current);
        if (records.status === "refused") return { mutations: [], result: records };
        if (records.value.some((record) => record.snapshot.mapId === parsed.data.mapId)) {
          return {
            mutations: [],
            result: { status: "refused", reason: "authoring-state-exists" },
          };
        }
        const existing = resolveForwardDeliverySubjectFromTransitions({
          records: records.value,
          currentWorkUnitId: input.currentWorkUnitId,
          recordWorkUnitId: (record) => record.snapshot.originalWorkUnitId,
          transitions: input.transitions,
        });
        if (existing.status === "indeterminate") {
          return { mutations: [], result: { status: "refused", reason: existing.reason } };
        }
        if (existing.status === "match") {
          return { mutations: [], result: { status: "refused", reason: "authoring-state-exists" } };
        }
        const stored = { snapshot: parsed.data, markdown: input.pair.markdown };
        return {
          mutations: [
            { recordName: names.json, kind: "write", content: `${canonicalize(parsed.data)}\n` },
            { recordName: names.markdown, kind: "write", content: input.pair.markdown },
          ],
          result: { status: "ok", value: stored },
        };
      },
    );
  }

  async read(mapId: string): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringPair | null>> {
    const parsedMapId = SlugSchema.safeParse(mapId);
    if (!parsedMapId.success) return { status: "refused", reason: "identity-mismatch" };
    const names = recordNames(parsedMapId.data);
    return this.publisher.transact<DeliveryAuthoringStoreResult<DeliveryAuthoringPair | null>>(
      AUTHORING_LOCATION,
      [names.json, names.markdown],
      (current) => {
        const rawSnapshot = current.get(names.json) ?? null;
        const markdown = current.get(names.markdown) ?? null;
        if (rawSnapshot === null && markdown === null) {
          return { mutations: [], result: { status: "ok", value: null } as const };
        }
        if (rawSnapshot === null || markdown === null) {
          return {
            mutations: [],
            result: { status: "refused", reason: "authoring-state-corrupt" } as const,
          };
        }
        const decoded = decodeSnapshot(rawSnapshot, parsedMapId.data);
        return decoded.status === "refused"
          ? { mutations: [], result: decoded }
          : {
            mutations: [],
            result: {
              status: "ok",
              value: { snapshot: decoded.value, markdown },
            } as const,
          };
      },
    );
  }

  async enumerate(): Promise<DeliveryAuthoringStoreResult<readonly DeliveryAuthoringRecord[]>> {
    return decodeRecords(await this.publisher.snapshot(AUTHORING_LOCATION));
  }

  async abandon(
    mapId: string,
  ): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    const parsedMapId = SlugSchema.safeParse(mapId);
    if (!parsedMapId.success) return { status: "refused", reason: "identity-mismatch" };
    const names = recordNames(parsedMapId.data);
    return this.publisher.transact<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>>(
      AUTHORING_LOCATION,
      [names.json, names.markdown],
      (current) => {
        const removed = current.get(names.json) !== null || current.get(names.markdown) !== null;
        return {
          mutations: [
            { recordName: names.markdown, kind: "delete" },
            { recordName: names.json, kind: "delete" },
          ],
          result: { status: "ok", value: { removed } },
        };
      },
    );
  }

  async recordCandidate(
    mapId: string,
    expected: DeliveryAuthoringSnapshotV1,
    candidatePlanDigest: string,
    candidateProjectionDigest: string,
    candidateOutcome: DeliveryAuthoringCandidateOutcomeV1,
  ): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringSnapshotV1>> {
    const parsedMapId = SlugSchema.safeParse(mapId);
    if (!parsedMapId.success || expected.mapId !== parsedMapId.data) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    const names = recordNames(parsedMapId.data);
    return this.publisher.transact<DeliveryAuthoringStoreResult<DeliveryAuthoringSnapshotV1>>(
      AUTHORING_LOCATION,
      [names.json],
      (current) => {
        const raw = current.get(names.json) ?? null;
        if (raw === null) {
          return { mutations: [], result: { status: "refused", reason: "version-conflict" } };
        }
        const decoded = decodeSnapshot(raw, parsedMapId.data);
        if (decoded.status === "refused") return { mutations: [], result: decoded };
        if (canonicalize(decoded.value) !== canonicalize(expected)) {
          return { mutations: [], result: { status: "refused", reason: "version-conflict" } };
        }
        const next = DeliveryAuthoringSnapshotV1Schema.safeParse({
          ...decoded.value,
          candidatePlanDigest,
          candidateProjectionDigest,
          candidateOutcome,
        });
        if (!next.success) {
          return { mutations: [], result: { status: "refused", reason: "record-malformed" } };
        }
        return {
          mutations: [{
            recordName: names.json,
            kind: "write",
            content: `${canonicalize(next.data)}\n`,
          }],
          result: { status: "ok", value: next.data },
        };
      },
    );
  }

  async deleteMarkdown(
    mapId: string,
  ): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    return this.deleteRecord(mapId, "markdown");
  }

  async deleteSnapshot(
    mapId: string,
  ): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    return this.deleteRecord(mapId, "json");
  }

  private async deleteRecord(
    mapId: string,
    kind: "json" | "markdown",
  ): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    const parsedMapId = SlugSchema.safeParse(mapId);
    if (!parsedMapId.success) return { status: "refused", reason: "identity-mismatch" };
    const name = recordNames(parsedMapId.data)[kind];
    return this.publisher.transact<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>>(
      AUTHORING_LOCATION,
      [name],
      (current) => {
        const removed = current.get(name) !== null;
        return {
          mutations: [{ recordName: name, kind: "delete" }],
          result: { status: "ok", value: { removed } },
        };
      },
    );
  }
}
