/** Faithful fixture hooks for the in-memory whole-contract reference backend. */

import { randomUUID } from "node:crypto";
import {
  FAMILY_IDS, FAMILY_REGISTRY, KIND_SHAPES, KIND_REGISTRY, OwnerIdentitySchema, RecordReferenceSchema,
  ConflictRecordSchema, createKindRegistry, familyOf, type KindId, type RecordParser,
} from "../../../src/lib/store/index.js";
import { ReferenceBackend } from "./reference-backend.js";
import { canonicalReference, currentStateVersion, recordKey } from "./model.js";
import { surfaceLock } from "./refusals.js";
import type { ConformanceFixture, ConformanceRegistration, FixtureDeclarations } from "./fixture-contract.js";
import { createMemoryRemote } from "./sync.js";
import { produceReferenceRecovery, type ReferenceRecoveryState } from "./reference-recovery.js";
import { writeReference } from "./write.js";

const jsonParser: RecordParser = (content) => {
  try {
    const data: unknown = JSON.parse(content);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? { success: true, data } : { success: false, error: "Expected a test machine-record object." };
  } catch { return { success: false, error: "Expected the valid test machine-record JSON format." }; }
};
const conflictParser: RecordParser = (content) => {
  try { const parsed = ConflictRecordSchema.safeParse(JSON.parse(content)); return parsed.success ? { success: true, data: parsed.data } : { success: false, error: "Expected a typed conflict record." }; }
  catch { return { success: false, error: "Expected valid conflict-record JSON." }; }
};

/** Reference serves every role; named exclusions are only interim backend-specific cases. */
export const referenceDeclarations: FixtureDeclarations = {
  families: FAMILY_IDS, mergesConcurrentWrites: true, substrates: ["memory"], stateOffBranch: true,
  liveListingStateVersion: true,
  syncFamilies: FAMILY_IDS,
  identitySyncFamilies: FAMILY_IDS.filter((family) => FAMILY_REGISTRY[family].scope === "identity"),
  entryShapes: Object.fromEntries(["work-item/description", "work-item/inbound", "personal/errand-queue"].map((kind) => [kind, { shape: "heading", sections: ["Entries"] }])),
  familyExclusions: Object.fromEntries(FAMILY_IDS.map((family) => [family, { items: {
    5: "Memory has one atomic substrate; only the in-repo backend refuses a cross-substrate batch.",
    8: "Memory state versions cover every record in the namespace.",
  } }])),
  refusalExclusions: {
    "checkout-not-writable": "A memory namespace has no checkout write authority.",
    "unsupported:cross-substrate-batch": "Every memory batch uses one atomic substrate.",
    "unsupported:uncovered-state-version": "Memory snapshots cover every family.",
    "unsupported:work-item-kind-required": "Memory enumerates every kind in a work-item family.",
    "unsupported:unhomed-kind": "Memory serves every registered kind.",
    "unsupported:personal-history": "Memory records history for personal records.",
    "unsupported:links-write": "Memory stores work-item links.",
    "unsupported:placement-move": "Memory moves work items by placement writes.",
    "unsupported:completed-create": "Memory can create a completed work item.",
    "unsupported:rename": "Memory mints UIDs and can rename a work item.",
    "transient-write:unreachable": "Reference writes are local; transport failures belong to sync.",
    "transient-write:refused": "Reference writes never publish inside the write.",
    "transient-write:retries-exhausted": "Reference writes never run a remote publish retry loop.",
    "transient-write:version-conflict": "Reference writes do not reconcile an entire transient identity ref.",
    "transient-write:record-malformed": "Reference writes validate only the named record, never another record on a transient identity ref.",
  },
  rejectingContentUnavailable: Object.fromEntries((Object.keys(KIND_SHAPES) as KindId[])
    .filter((kind) => KIND_REGISTRY[kind].merge !== "single-writer").map((kind) => [kind, "No write parser is registered for this prose or entry-list test kind."])),
};

/** Open a fresh reference fixture with pure test field parsers, never production field schemas.
 * @returns All backend-neutral hooks over an independently owned memory namespace.
 */
export function createReferenceFixture(): ConformanceFixture {
  const parsers = Object.fromEntries((Object.keys(KIND_SHAPES) as KindId[])
    .filter((kind) => KIND_REGISTRY[kind].merge === "single-writer").map((kind) => [kind, kind.endsWith("/conflict-record") ? conflictParser : jsonParser]));
  const definitions = createKindRegistry(parsers);
  const registry = Object.fromEntries((Object.keys(definitions) as KindId[]).map((kind) => [kind, {
    ...definitions[kind], ...(referenceDeclarations.entryShapes[kind] ? { entry: referenceDeclarations.entryShapes[kind] } : {}),
  }])) as typeof definitions;
  let clock = 0;
  const store = new ReferenceBackend({ registry, environment: { identity: "test-user", actor: "local", now: () => clock, wait: (milliseconds) => { clock += milliseconds; } } });
  const remote = createMemoryRemote();
  const remoteWriter = new ReferenceBackend({ state: remote.state, registry,
    environment: { identity: "test-user", actor: "remote", now: () => clock, wait: (milliseconds) => { clock += milliseconds; } } });
  let contentionWrites = 0;
  const recovery: ReferenceRecoveryState = { repairs: new Map() };
  const fixture: ConformanceFixture = {
    store, declarations: referenceDeclarations,
    reference(kind, suffix = "one") {
      const shape = KIND_SHAPES[kind];
      const name = shape.owner === "person" ? "test-user" : `${shape.owner}-${suffix}`;
      const owner = OwnerIdentitySchema.parse({ type: shape.owner, name });
      const key = shape.key === "pass" ? { activity: "review", number: suffix === "two" ? 2 : 1 }
        : shape.key === "path" ? `scratch/${suffix}.md` : suffix;
      return RecordReferenceSchema.parse({ owner, kind, ...(shape.key === null ? {} : { key }) });
    },
    content(reference, variant = "valid") {
      if (variant === "invalid") return "invalid machine JSON";
      if (reference.kind.endsWith("/conflict-record")) {
        const target = (Object.keys(KIND_SHAPES) as KindId[]).find((kind) => familyOf(kind) === familyOf(reference.kind) && !kind.endsWith("/conflict-record"))!;
        const targetReference = RecordReferenceSchema.parse({ owner: reference.owner, kind: target,
          ...(KIND_SHAPES[target].key === null ? {} : { key: KIND_SHAPES[target].key === "pass" ? { activity: "test", number: 1 } : "one" }) });
        return JSON.stringify({ record: targetReference, location: { kind: "record" }, base: "base",
          current: { content: "current", label: { actor: "current", time: new Date(0).toISOString() } },
          incoming: { content: "incoming", label: { actor: "incoming", time: new Date(0).toISOString() } } });
      }
      if (registry[reference.kind].merge === "single-writer") return JSON.stringify({ value: variant === "changed-again" ? 3 : variant === "changed" ? 2 : 1, claimId: "1".repeat(32) });
      if (registry[reference.kind].merge === "entry") {
        const config = registry[reference.kind].entry ?? { shape: "heading", sections: ["Entries"] };
        const header = config.shape === "heading" ? "### [ ] **First**\n\n" : "**First:**\n_Remove when:_ trigger satisfied\n";
        return `# Entries\n\n## ${config.sections[0]}\n\n${header}${config.shape === "heading" ? "- " : ""}_Id:_ \`11111111\`\n\n${variant === "changed-again" ? "another change" : variant === "changed" ? "changed" : "first"}\n`;
      }
      return variant === "changed-again" ? "opening\nanother change\nclosing\n" : variant === "changed" ? "opening\nchanged\nclosing\n" : "opening\nbase\nclosing\n";
    },
    async settle() { return currentStateVersion(store.state); },
    reopen() { return new ReferenceBackend({ state: store.state, environment: store.environment, registry, publication: store.context.publication }); },
    async race(left, right) { return Promise.all([store.write(left), store.write(right)]); },
    remote(enabled) {
      store.context.publication.remote = enabled ? remote : undefined;
      return enabled ? remoteWriter : undefined;
    },
    identity(name) { store.environment.identity = name; },
    plant(reference, kind) {
      if (kind === "family-unreadable") { store.state.unreadable.add(familyOf(reference.kind)); return; }
      const canonical = canonicalReference(store.state, reference);
      const record = store.state.records.get(recordKey(canonical));
      if (record === undefined) throw new Error("Plant requires an existing stored entry");
      if (kind === "unknown-format-version") { record.formatVersion = registry[reference.kind].formatVersion + 1; return; }
      if (kind === "oversized") record.content = "x".repeat(1024 * 1024 + 1);
      if (kind === "malformed") record.content = "invalid machine JSON";
      const faultKind = kind === "key-mismatch" ? "identity-mismatch" : kind;
      store.state.faults.set(recordKey(canonical), { reference: canonical, kind: faultKind,
        ...(kind === "key-mismatch" ? { actual: RecordReferenceSchema.parse({ ...canonical, owner: canonical.owner.type === "person" ? { ...canonical.owner, name: "wrong-owner" } : { ...canonical.owner, uid: randomUUID() } }) } : {}) });
    },
    hold(reference, held) {
      if (held) store.state.locks.add(surfaceLock(reference)); else store.state.locks.delete(surfaceLock(reference));
    },
    remoteState(state, message) {
      remote.condition = state;
      if (message !== undefined) remote.message = message;
      remote.beforePublish = state === "contended" ? () => {
        const reference = fixture.reference("project-registry/counter", "contention");
        const prior = remote.state.records.get(recordKey(canonicalReference(remote.state, reference)));
        const result = writeReference(remoteWriter.context, { action: "put", reference,
          content: JSON.stringify({ value: ++contentionWrites }), expected: prior?.version ?? null,
          provenance: { verb: "reserve", lifecycleAction: "reserve" } });
        if (result.status !== "ok") throw new Error("The contending remote writer could not advance its record");
      } : undefined;
    },
    async produce(caseId) { return produceReferenceRecovery(fixture, store, recovery, caseId); },
    async repair(caseId) {
      const repair = recovery.repairs.get(caseId);
      if (repair === undefined) throw new Error(`No produced refusal to repair: ${caseId}`);
      await repair();
    },
  };
  return fixture;
}

/** Static fixture registration consumed by the shared conformance suite. */
export const referenceRegistration: ConformanceRegistration = { declarations: referenceDeclarations, create: createReferenceFixture };
