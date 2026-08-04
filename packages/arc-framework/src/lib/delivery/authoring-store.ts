/** Repository-common storage for one canonical snapshot and its editable Markdown map. */

import type { GitCommonStateTransactionPublisher } from "../git-common-state.js";
import { canonicalize, SlugSchema } from "../kernel/index.js";
import {
  DeliveryAuthoringSnapshotV1Schema,
  type DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";

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
  | "identity-mismatch"
  | "record-malformed";

/** Result of one paired authoring-state operation. */
export type DeliveryAuthoringStoreResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "refused"; readonly reason: DeliveryAuthoringStoreFailure };

/** Storage contract consumed by singleton resolution and command handlers. */
export interface DeliveryAuthoringStore {
  create(pair: DeliveryAuthoringPair): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringPair>>;
  enumerate(): Promise<DeliveryAuthoringStoreResult<readonly DeliveryAuthoringRecord[]>>;
  abandon(mapId: string): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>>;
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

/** Namespace-locked adapter preserving the JSON/Markdown pair as one logical record. */
export class RepositoryDeliveryAuthoringStore implements DeliveryAuthoringStore {
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
    const entries = await this.publisher.snapshot(AUTHORING_LOCATION);
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
}
