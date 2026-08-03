/** Git-common-directory adapter for append-only delivery assurance chains. */

import type { GitCommonStatePublisher } from "../git-common-state.js";
import { canonicalDigest, isCanonicalDigest, type CanonicalDigest } from "../kernel/index.js";
import type {
  DeliveryAssuranceChain,
  DeliveryAssuranceChainEntry,
  DeliveryAssuranceStore,
  DeliveryAssuranceStoreFailure,
  DeliveryPayloadCodec,
  DeliveryStoreResult,
} from "./ports.js";

const ASSURANCE_LOCATION = { root: "delivery", namespace: "assurance" } as const;
const ASSURANCE_SEMANTICS = "delivery-assurance-store/v1";

interface AssuranceEnvelope<T> {
  readonly schemaVersion: 1;
  readonly semanticsVersion: typeof ASSURANCE_SEMANTICS;
  readonly planId: string;
  readonly entries: readonly DeliveryAssuranceChainEntry<T>[];
  readonly tailDigest: CanonicalDigest | null;
}

function recordName(planId: string): string {
  return `${planId}.json`;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function assuranceEntryDigest(
  predecessorDigest: CanonicalDigest | null,
  value: unknown,
): CanonicalDigest {
  return canonicalDigest({
    domain: "delivery-assurance-chain-entry/v1",
    predecessorDigest,
    value,
  });
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function decodeAssuranceChain<T>(
  value: unknown,
  addressedPlanId: string,
  codec: DeliveryPayloadCodec<T>,
): DeliveryStoreResult<DeliveryAssuranceChain<T>, DeliveryAssuranceStoreFailure> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { status: "refused", reason: "record-malformed" };
  }
  const chain = value as Record<string, unknown>;
  if (!hasExactKeys(chain, ["entries", "tailDigest"])
    || !Array.isArray(chain["entries"])
    || !(chain["tailDigest"] === null || isCanonicalDigest(chain["tailDigest"]))) {
    return { status: "refused", reason: "record-malformed" };
  }
  const entries: DeliveryAssuranceChainEntry<T>[] = [];
  let predecessorDigest: CanonicalDigest | null = null;
  for (const candidate of chain["entries"]) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      return { status: "refused", reason: "record-malformed" };
    }
    const entry = candidate as Record<string, unknown>;
    if (!hasExactKeys(entry, ["entryDigest", "predecessorDigest", "value"])
      || !(entry["predecessorDigest"] === null || isCanonicalDigest(entry["predecessorDigest"]))
      || !isCanonicalDigest(entry["entryDigest"])) {
      return { status: "refused", reason: "record-malformed" };
    }
    const decoded = codec.decode(entry["value"]);
    if (decoded.status === "refused") return { status: "refused", reason: "record-malformed" };
    if (codec.planId(decoded.value) !== addressedPlanId) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    if (entry["predecessorDigest"] !== predecessorDigest
      || entry["entryDigest"] !== assuranceEntryDigest(predecessorDigest, decoded.value)) {
      return { status: "refused", reason: "chain-invalid" };
    }
    const decodedEntry: DeliveryAssuranceChainEntry<T> = {
      predecessorDigest,
      entryDigest: entry["entryDigest"],
      value: decoded.value,
    };
    entries.push(decodedEntry);
    predecessorDigest = decodedEntry.entryDigest;
  }
  if (chain["tailDigest"] !== predecessorDigest) {
    return { status: "refused", reason: "chain-invalid" };
  }
  return { status: "ok", value: { entries, tailDigest: predecessorDigest } };
}

function decodeAssuranceEnvelope<T>(
  raw: string,
  addressedPlanId: string,
  codec: DeliveryPayloadCodec<T>,
): DeliveryStoreResult<DeliveryAssuranceChain<T>, DeliveryAssuranceStoreFailure> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "refused", reason: "record-malformed" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { status: "refused", reason: "record-malformed" };
  }
  const envelope = value as Record<string, unknown>;
  if (!hasExactKeys(envelope, ["entries", "planId", "schemaVersion", "semanticsVersion", "tailDigest"])
    || envelope["schemaVersion"] !== 1
    || envelope["semanticsVersion"] !== ASSURANCE_SEMANTICS
    || typeof envelope["planId"] !== "string") {
    return { status: "refused", reason: "record-malformed" };
  }
  if (envelope["planId"] !== addressedPlanId) {
    return { status: "refused", reason: "identity-mismatch" };
  }
  return decodeAssuranceChain(
    { entries: envelope["entries"], tailDigest: envelope["tailDigest"] },
    addressedPlanId,
    codec,
  );
}

function assuranceEnvelope<T>(planId: string, chain: DeliveryAssuranceChain<T>): AssuranceEnvelope<T> {
  return {
    schemaVersion: 1,
    semanticsVersion: ASSURANCE_SEMANTICS,
    planId,
    entries: chain.entries,
    tailDigest: chain.tailDigest,
  };
}

/** Repository-common append-only assurance adapter. */
export class RepositoryDeliveryAssuranceStore<TAssurance> implements DeliveryAssuranceStore<TAssurance> {
  constructor(
    private readonly publisher: GitCommonStatePublisher,
    private readonly codec: DeliveryPayloadCodec<TAssurance>,
  ) {}

  async read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChain<TAssurance> | null, DeliveryAssuranceStoreFailure>> {
    const raw = await this.publisher.read(ASSURANCE_LOCATION, recordName(planId));
    if (raw === null) return { status: "ok", value: null };
    return decodeAssuranceEnvelope(raw, planId, this.codec);
  }

  async append(
    planId: string,
    value: TAssurance,
    expectedTailDigest: CanonicalDigest | null,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChainEntry<TAssurance>, DeliveryAssuranceStoreFailure>> {
    const proposed = this.codec.decode(value);
    if (proposed.status === "refused") return { status: "refused", reason: "record-malformed" };
    if (this.codec.planId(proposed.value) !== planId) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    return this.publisher.update<DeliveryStoreResult<
      DeliveryAssuranceChainEntry<TAssurance>,
      DeliveryAssuranceStoreFailure
    >>(ASSURANCE_LOCATION, recordName(planId), (raw) => {
      let chain: DeliveryAssuranceChain<TAssurance> = { entries: [], tailDigest: null };
      if (raw !== null) {
        const decoded = decodeAssuranceEnvelope(raw, planId, this.codec);
        if (decoded.status === "refused") return { kind: "keep", result: decoded };
        chain = decoded.value;
        const tail = chain.entries.at(-1);
        if (tail !== undefined
          && tail.predecessorDigest === expectedTailDigest
          && serialize(tail.value) === serialize(proposed.value)) {
          return { kind: "keep", result: { status: "ok", value: tail } };
        }
      }
      if (chain.tailDigest !== expectedTailDigest) {
        return { kind: "keep", result: { status: "refused", reason: "predecessor-conflict" } };
      }
      const entry: DeliveryAssuranceChainEntry<TAssurance> = {
        predecessorDigest: expectedTailDigest,
        entryDigest: assuranceEntryDigest(expectedTailDigest, proposed.value),
        value: proposed.value,
      };
      const next = {
        entries: [...chain.entries, entry],
        tailDigest: entry.entryDigest,
      };
      return {
        kind: "write",
        content: serialize(assuranceEnvelope(planId, next)),
        result: { status: "ok", value: entry },
      };
    });
  }

  async exportChain(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChain<TAssurance> | null, DeliveryAssuranceStoreFailure>> {
    return this.read(planId);
  }

  async importChain(
    planId: string,
    chain: DeliveryAssuranceChain<TAssurance>,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChain<TAssurance>, DeliveryAssuranceStoreFailure>> {
    const decoded = decodeAssuranceChain(chain, planId, this.codec);
    if (decoded.status === "refused") return decoded;
    return this.publisher.update<DeliveryStoreResult<
      DeliveryAssuranceChain<TAssurance>,
      DeliveryAssuranceStoreFailure
    >>(ASSURANCE_LOCATION, recordName(planId), (raw) => {
      if (raw !== null) {
        return { kind: "keep", result: { status: "refused", reason: "import-nonempty" } };
      }
      return {
        kind: "write",
        content: serialize(assuranceEnvelope(planId, decoded.value)),
        result: decoded,
      };
    });
  }
}
