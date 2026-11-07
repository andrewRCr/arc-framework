/** Rename target admission shares creation's ranked namespace over both backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema, sameOwner } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { resolveRenameReferences } from "../../src/lib/store/rename-reference-resolution.js";
import { writeMetaPause, writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const native = backend === "ref" ? await createRefFixture(production) : undefined;
  const state = native ?? createReferenceFixture({}, production);
  const storeFactory = async () => {
    if (native === undefined) return state.store;
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: native.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: native.ports.registry, identity: native.ports.identity,
      actor: native.ports.actor, clock: native.ports.clock, random: native.ports.random });
  };
  const concurrentWorkUnit = async (name: string) => {
    if (native === undefined) throw new Error("Concurrent name-read ties require the native fixture");
    const uid = "12345678-abcd-4abc-8abc-123456789abc";
    const content = makeMetaFixture(name, { state: "Planning", currentWorkflow: null });
    return success(await state.store.read({ reference: await plantRefPrimary(native,
      { kind: "work-item/meta", name, uid, content }) }));
  };
  return { ...state, cli, concurrentWorkUnit, invoke: (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, {
    storeFactory: async () => { const store = await storeFactory(); return decorate?.(store) ?? store; },
  }) };
}

describe.each(["reference", "ref"] as const)("rename target reuse over %s", backend => {
  it("settles the subject and a stub against one shared archived provider", async () => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name,
      { state: "Planning", currentWorkflow: null, dependsOn: [target.reference.owner.name] }), { kind: "backlog", commitment: "planned" });
    const stubRef = f.reference("work-item/meta", "waiting");
    const stub = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name,
      { state: "Planning", currentWorkflow: null, dependsOn: [target.reference.owner.name] }), { kind: "backlog", commitment: "planned" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const result = await f.invoke(["rename", source.reference.owner.uid, target.reference.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    for (const record of [source, stub]) {
      expect(success(await f.store.read({ reference: record.reference })).fields).toMatchObject({ dependsOn: [] });
    }
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    const histories = await Promise.all([source, stub].map(async record => success(await f.store.history({ reference: record.reference }))));
    const own = histories[0]?.[0]?.provenance, settled = histories[1]?.[0]?.provenance;
    if (own === undefined || settled === undefined || !("batchId" in own) || !("batchId" in settled)) throw new Error("Expected atomic rename provenance");
    expect(own.batchId).toBe(settled.batchId);
  }, 60_000);

  it.each(["in-flight", "both-names"] as const)("keeps the %s dependency refusal and lands after explicit repair", async kind => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "provisional" });
    const stubRef = f.reference("work-item/meta", "waiting"), active = kind === "in-flight";
    const waiting = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name, { state: active ? "Active" : "Planning",
      currentWorkflow: active ? "process-task-loop" : null,
      dependsOn: active ? [target.reference.owner.name] : [source.reference.owner.name, target.reference.owner.name] }),
    active ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const argv = ["rename", source.reference.owner.uid, target.reference.owner.name, "--json"], before = success(await f.store.version());
    const refused = await f.invoke(argv);
    expect(refused.exitCode).toBe(1);
    expect(refused.result).toMatchObject({ status: "rejected", refusal: { rule: "work-item.slug-edges" },
      remedy: { text: expect.stringContaining(active ? "arc wu reconcile --apply" : "Anyone may edit a stub's edge") } });
    expect(success(await f.store.version())).toBe(before);
    for (const record of [source, target, waiting]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
    success(await f.store.write({ ...recordPut(waiting, { content: writeMetaDependsOn(waiting.content, active ? [] : [source.reference.owner.name]) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    const renamed = await f.invoke(argv);
    expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
    expect(success(await f.store.read({ reference: waiting.reference })).fields).toMatchObject({ dependsOn: active ? [] : [target.reference.owner.name] });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
  }, 60_000);

  it("settles a stub's edge to the archived target in the rename's single batch", async () => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "provisional" });
    const stubRef = f.reference("work-item/meta", "waiting");
    const stub = await seed(f, stubRef, makeMetaFixture(stubRef.owner.name,
      { state: "Planning", currentWorkflow: null, dependsOn: [target.reference.owner.name] }), { kind: "backlog", commitment: "planned" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const result = await f.invoke(["rename", source.reference.owner.uid, target.reference.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    expect(success(await f.store.read({ reference: source.reference })).reference.owner.name).toBe(target.reference.owner.name);
    expect(success(await f.store.read({ reference: stub.reference })).fields).toMatchObject({ dependsOn: [] });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    const ownHistory = success(await f.store.history({ reference: source.reference })), stubHistory = success(await f.store.history({ reference: stub.reference }));
    const own = ownHistory[0]?.provenance, settled = stubHistory[0]?.provenance;
    if (own === undefined || settled === undefined || !("batchId" in own) || !("batchId" in settled)) throw new Error("Expected atomic rename provenance");
    expect(settled.batchId).toBe(own.batchId);
    expect(stubHistory.filter(entry => "batchId" in entry.provenance && entry.provenance.batchId === own.batchId)).toHaveLength(1);
  }, 60_000);

  it("reuses an archived work unit's current slug without changing that owner", async () => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source"), targetRef = f.reference("work-item/meta", "target");
    const target = await seed(f, targetRef, makeMetaFixture(targetRef.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "provisional" });
    if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
    const result = await f.invoke(["rename", source.reference.owner.uid, target.reference.owner.name, "--json"]);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const renamed = success(await f.store.read({ reference: source.reference }));
    expect(renamed.reference.owner).toEqual({ ...source.reference.owner, name: target.reference.owner.name });
    expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse(target.reference.owner.name) })).reference).toEqual(renamed.reference);
    expect(result.result).toMatchObject({ status: "renamed", reference: renamed.reference });
  }, 60_000);
});

describe.each(["reference", "ref"] as const)("work-item rename participant arrival over %s", backend => {
  it.each(["dependency", "active-dependency", "wait", "filename", "owned-filename"] as const)(
    "reprepares after a %s participant arrives before admission", async kind => {
      const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source");
      const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
        { kind: "backlog", commitment: "planned" });
      if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
      const arriving = kind === "owned-filename" ? RecordReferenceSchema.parse({ kind: "work-item/draft", owner: source.reference.owner })
        : f.reference("work-item/meta", "arriving"), active = kind === "active-dependency" || kind === "wait";
      let arrival: StoreRecord | undefined, version: unknown;
      const argv = ["rename", source.reference.owner.uid, "renamed", "--json"];
      const refused = await f.invoke(argv, store => new Proxy(store, { get(target, key) {
        if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
          if (arrival === undefined) {
            const content = kind === "owned-filename" ? `# Draft\n\nSee \`meta-${sourceRef.owner.name}.md\`.\n`
              : makeMetaFixture(arriving.owner.name, { state: active ? "Active" : "Planning",
              currentWorkflow: active ? "process-task-loop" : null,
              dependsOn: kind === "dependency" || kind === "active-dependency" ? [sourceRef.owner.name] : [] })
              + (kind === "filename" ? `\nSee \`meta-${sourceRef.owner.name}.md\`.\n` : "");
            arrival = await seed(f, arriving, content, active ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
            if (kind === "wait") {
              success(await f.store.write({ ...recordPut(arrival, { content: writeMetaPause(arrival.content,
                { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-16T00:00:00Z", reason: "Wait for work.",
                  waitsOn: { kind: "work-unit", slug: SlugSchema.parse(sourceRef.owner.name) }, resumeNotes: null, open: true }) }),
              provenance: { verb: "pause", lifecycleAction: "pause" } }));
              arrival = success(await f.store.read({ reference: arrival.reference }));
            }
            version = success(await f.store.version());
          }
          return store.batch(input);
        };
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } }));
      expect(refused).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { rule: "rename.references" } } });
      expect(success(await f.store.version())).toBe(version);
      expect(success(await f.store.read({ reference: source.reference }))).toEqual(source);
      if (arrival === undefined) throw new Error("Expected concurrent arrival");
      expect(success(await f.store.read({ reference: arrival.reference }))).toEqual(arrival);
      const retried = await f.invoke(argv);
      expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
      const current = success(await f.store.read({ reference: arrival.reference }));
      if (kind === "dependency") expect(current.fields).toMatchObject({ dependsOn: ["renamed"] });
      else if (kind === "filename" || kind === "owned-filename") expect(current.content).toContain("See `meta-renamed.md`.");
      else {
        expect(current).toEqual(arrival);
        if (current.reference.owner.type !== "work-item" || current.reference.owner.uid === undefined) throw new Error("Expected arrival UID");
        expect(retried.result).toMatchObject({ report: { references: expect.arrayContaining([
          { record: { type: "work-unit", name: arriving.owner.name, uid: current.reference.owner.uid },
            edits: [{ kind: "field", field: kind === "wait" ? "waitsOn" : "dependsOn", from: sourceRef.owner.name, to: "renamed" }] },
        ]) } });
      }
    }, 60_000);

  it.each(["started-prose", "completed-prose", "plain-prose"] as const)("allows an unrelated %s arrival", async kind => {
    const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source");
    const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "planned" });
    const arriving = f.reference("work-item/meta", "unrelated");
    let arrival: StoreRecord | undefined;
    const result = await f.invoke(["rename", source.reference.owner.name, "renamed", "--json"], store => new Proxy(store, { get(target, key) {
      if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
        if (arrival === undefined) {
          const active = kind === "started-prose", ended = kind === "completed-prose";
          const citation = kind === "plain-prose" ? `Mention meta-${sourceRef.owner.name}.md plainly.\n` : `See \`meta-${sourceRef.owner.name}.md\`.\n`;
          arrival = await seed(f, arriving, makeMetaFixture(arriving.owner.name, { state: active ? "Active" : ended ? "Shipped" : "Planning",
            currentWorkflow: active ? "process-task-loop" : null }) + citation,
          active ? { kind: "active" } : ended ? completed : { kind: "backlog", commitment: "planned" });
        }
        return store.batch(input);
      };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } }));
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    if (arrival === undefined) throw new Error("Expected arrival");
    expect(success(await f.store.read({ reference: arrival.reference }))).toEqual(arrival);
    expect(result.result).toMatchObject({ report: { references: [] } });
  }, 60_000);
});

describe.each(["reference", "ref"] as const)("owned participant resolution over %s", backend => {
  // Memory name reads use an identity index; the native store exercises concurrent name-read ambiguity.
  const resolutions = backend === "reference" ? ["subject", "other"] as const : ["subject", "ambiguous", "other"] as const;
  it.each(resolutions)(
    "reprepares owned arrivals independently of %s shared-name resolution", async resolution => {
      const f = await fixture(backend), sourceRef = f.reference("work-item/meta", "source");
      const source = await seed(f, sourceRef, makeMetaFixture(sourceRef.owner.name,
        { state: resolution === "ambiguous" ? "Planning" : "Shipped", currentWorkflow: null }),
      resolution === "ambiguous" ? { kind: "backlog", commitment: "planned" } : completed);
      const namesake = resolution === "subject" ? undefined : resolution === "ambiguous"
        ? await f.concurrentWorkUnit(sourceRef.owner.name) : await seed(f, sourceRef,
          makeMetaFixture(sourceRef.owner.name, { state: "Planning", currentWorkflow: null }), { kind: "backlog", commitment: "planned" });
      expect(await resolveRenameReferences(f.store, source.reference, source.reference.owner.name)).toEqual({ status: "ok", result: resolution });
      if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
      const citation = `See \`meta-${source.reference.owner.name}.md\`.\n`;
      const sharedRef = f.reference("work-item/meta", "waiting");
      const shared = await seed(f, sharedRef, makeMetaFixture(sharedRef.owner.name, { state: "Planning", currentWorkflow: null }) + citation,
        { kind: "backlog", commitment: "planned" });
      const arrivals: StoreRecord[] = [];
      let version: unknown;
      const argv = ["rename", source.reference.owner.uid, "renamed", "--json"];
      const refused = await f.invoke(argv, store => new Proxy(store, { get(target, key) {
        if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
          if (arrivals.length === 0) {
            for (const kind of ["work-item/draft", "work-item/spec", "work-item/task-list", "work-item/notes", "work-item/companion"] as const) {
              const reference = RecordReferenceSchema.parse({ kind, owner: source.reference.owner,
                ...(kind === "work-item/companion" ? { key: "appendix.md" } : {}) });
              arrivals.push(await seed(f, reference, `# Artifact\n\n${citation}`));
            }
            expect(success(await f.store.read({ reference: source.reference }))).toEqual(source);
            version = success(await f.store.version());
          }
          return store.batch(input);
        };
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } }));
      expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { rule: "rename.references" } } });
      expect(success(await f.store.version())).toBe(version);
      for (const record of [source, shared, namesake, ...arrivals]) {
        if (record !== undefined) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
      }
      const retried = await f.invoke(argv);
      expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
      for (const arrival of arrivals) {
        const current = success(await f.store.read({ reference: arrival.reference }));
        expect(current.reference.owner).toEqual({ ...source.reference.owner, name: "renamed" });
        expect(current.content).toContain("See `meta-renamed.md`.");
      }
      const currentShared = success(await f.store.read({ reference: shared.reference }));
      if (resolution === "subject") expect(currentShared.content).toContain("See `meta-renamed.md`.");
      else expect(currentShared).toEqual({ ...shared, version: currentShared.version });
      if (namesake !== undefined) {
        const currentNamesake = success(await f.store.read({ reference: namesake.reference }));
        expect(currentNamesake).toEqual({ ...namesake, version: currentNamesake.version });
      }
      expect(retried.result).toMatchObject({ report: { references: resolution === "ambiguous" ? expect.arrayContaining([
        expect.objectContaining({ record: expect.objectContaining({ name: shared.reference.owner.name }) }),
      ]) : [] } });
    }, 60_000);
});

function renameUid(source: StoreRecord): string {
  if (source.reference.owner.type !== "work-item" || source.reference.owner.uid === undefined) throw new Error("Expected source UID");
  return source.reference.owner.uid;
}

function beforeRenameBatch(inject: () => Promise<void>): (store: Store) => Store {
  return store => new Proxy(store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      await inject();
      return store.batch(input);
    };
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

function selfReferenceArtifacts(owner: StoreRecord["reference"]["owner"], form: "title" | "plan", source: string, shared = false) {
  const roles = shared ? [["work-item/companion", "Research", `research-${source}.md`],
    ["work-item/companion", "Analysis", `analysis-${source}.md`]] as const
    : [["work-item/draft", "Draft"], ["work-item/spec", "Spec (`brief`)"],
      ["work-item/task-list", "Task List"], ["work-item/notes", "Notes"],
      ["work-item/companion", "Research", "research"],
      ["work-item/companion", "Analysis", "analysis"]] as const;
  return roles.map(([kind, label, key]) => ({
    reference: RecordReferenceSchema.parse({ kind, owner, ...(key === undefined ? {} : { key }) }),
    content: form === "title" ? `# ${label}: ${source}\n\nBody.\n` : `# Artifact\n\nUse \`--plan ${source}\`.\n`,
  }));
}

describe.each(["reference", "ref"] as const)("self-reference participant admission over %s", backend => {
  const resolutions = backend === "reference" ? ["subject", "other"] as const : ["subject", "ambiguous", "other"] as const;
  describe.each(["title", "plan"] as const)("%s rewrites", form => {
    it.each(resolutions)("reprepares owned artifacts under %s resolution", async resolution => {
      const f = await fixture(backend), ref = f.reference("work-item/meta", "source");
      const source = await seed(f, ref, makeMetaFixture(ref.owner.name,
        { state: resolution === "ambiguous" ? "Planning" : "Shipped", currentWorkflow: null }),
      resolution === "ambiguous" ? { kind: "backlog", commitment: "planned" } : completed);
      const namesake = resolution === "subject" ? undefined : resolution === "ambiguous"
        ? await f.concurrentWorkUnit(ref.owner.name) : await seed(f, ref,
          makeMetaFixture(ref.owner.name, { state: "Planning", currentWorkflow: null }), { kind: "backlog", commitment: "planned" });
      expect(await resolveRenameReferences(f.store, source.reference, ref.owner.name)).toEqual({ status: "ok", result: resolution });
      const arrivals: StoreRecord[] = [];
      let version: unknown;
      const argv = ["rename", renameUid(source), "renamed", "--json"];
      const refused = await f.invoke(argv, beforeRenameBatch(async () => {
        if (arrivals.length !== 0) return;
        for (const artifact of selfReferenceArtifacts(source.reference.owner, form, ref.owner.name)) {
          arrivals.push(await seed(f, artifact.reference, artifact.content));
        }
        version = success(await f.store.version());
      }));
      expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { rule: "rename.references" } } });
      expect(success(await f.store.version())).toBe(version);
      for (const record of [source, namesake, ...arrivals]) {
        if (record !== undefined) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
      }
      const retried = await f.invoke(argv);
      expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
      for (const arrival of arrivals) {
        const current = success(await f.store.read({ reference: arrival.reference }));
        expect(current.reference.owner).toEqual({ ...source.reference.owner, name: "renamed" });
        expect(current.content).toBe(arrival.content.replaceAll(ref.owner.name, "renamed"));
      }
      if (namesake !== undefined) {
        const current = success(await f.store.read({ reference: namesake.reference }));
        expect(current).toEqual({ ...namesake, version: current.version });
      }
      expect(retried.result).toMatchObject({ report: { references: [] } });
    }, 60_000);

    it.each(resolutions)("admits shared companions according to %s resolution", async resolution => {
      const f = await fixture(backend), ref = f.reference("work-item/meta", "source");
      const source = await seed(f, ref, makeMetaFixture(ref.owner.name,
        { state: resolution === "ambiguous" ? "Planning" : "Shipped", currentWorkflow: null }),
      resolution === "ambiguous" ? { kind: "backlog", commitment: "planned" } : completed);
      const namesake = resolution === "subject" ? undefined : resolution === "ambiguous"
        ? await f.concurrentWorkUnit(ref.owner.name) : await seed(f, ref,
          makeMetaFixture(ref.owner.name, { state: "Planning", currentWorkflow: null }), { kind: "backlog", commitment: "planned" });
      const holderRef = f.reference("work-item/meta", "holder");
      const holder = await seed(f, holderRef, makeMetaFixture(holderRef.owner.name, { state: "Planning", currentWorkflow: null }),
        { kind: "backlog", commitment: "planned" });
      expect(await resolveRenameReferences(f.store, source.reference, ref.owner.name)).toEqual({ status: "ok", result: resolution });
      const arrivals: StoreRecord[] = [];
      let version: unknown;
      const argv = ["rename", renameUid(source), "renamed", "--json"];
      const result = await f.invoke(argv, beforeRenameBatch(async () => {
        if (arrivals.length !== 0) return;
        for (const artifact of selfReferenceArtifacts(holder.reference.owner, form, ref.owner.name, true)) {
          arrivals.push(await seed(f, artifact.reference, artifact.content));
        }
        version = success(await f.store.version());
      }));
      if (resolution === "subject") {
        expect(result, JSON.stringify(result)).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { rule: "rename.references" } } });
        expect(success(await f.store.version())).toBe(version);
        for (const record of [source, holder, ...arrivals]) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
        const retried = await f.invoke(argv);
        expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
        for (const arrival of arrivals) expect(success(await f.store.read({ reference: arrival.reference })).content)
          .toBe(arrival.content.replaceAll(ref.owner.name, "renamed"));
        expect(retried.result).toMatchObject({ report: { references: [] } });
      } else {
        expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
        for (const record of [holder, namesake, ...arrivals]) {
          if (record === undefined) continue;
          const current = success(await f.store.read({ reference: record.reference }));
          expect(current).toEqual({ ...record, version: current.version });
        }
        expect(result.result).toMatchObject({ report: { references: [] } });
      }
    }, 60_000);

    it("rechecks prepared shared self-reference authority before publication", async () => {
      const f = await fixture(backend), ref = f.reference("work-item/meta", "source");
      const source = await seed(f, ref, makeMetaFixture(ref.owner.name, { state: "Shipped", currentWorkflow: null }), completed);
      const holderRef = f.reference("work-item/meta", "holder");
      const holder = await seed(f, holderRef, makeMetaFixture(holderRef.owner.name, { state: "Planning", currentWorkflow: null }),
        { kind: "backlog", commitment: "planned" });
      const shared: StoreRecord[] = [];
      for (const artifact of selfReferenceArtifacts(holder.reference.owner, form, ref.owner.name, true)) {
        shared.push(await seed(f, artifact.reference, artifact.content));
      }
      let namesake: StoreRecord | undefined, version: unknown;
      const argv = ["rename", renameUid(source), "renamed", "--json"];
      const refused = await f.invoke(argv, beforeRenameBatch(async () => {
        if (namesake !== undefined) return;
        namesake = await seed(f, ref, makeMetaFixture(ref.owner.name, { state: "Planning", currentWorkflow: null }),
          { kind: "backlog", commitment: "planned" });
        version = success(await f.store.version());
      }));
      expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1, result: { status: "rejected", refusal: { rule: "rename.references" } } });
      expect(success(await f.store.version())).toBe(version);
      for (const record of [source, holder, namesake, ...shared]) {
        if (record !== undefined) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
      }
      const retried = await f.invoke(argv);
      expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
      for (const record of shared) {
        const current = success(await f.store.read({ reference: record.reference }));
        expect(current).toEqual({ ...record, version: current.version });
      }
      expect(retried.result).toMatchObject({ report: { references: [] } });
    }, 60_000);
  });
});

describe.each(["reference", "ref"] as const)("self-reference no-op admission over %s", backend => {
  it("preserves unsupported owned forms and shared artifacts outside Planning backlog", async () => {
    const f = await fixture(backend), ref = f.reference("work-item/meta", "source");
    const source = await seed(f, ref, makeMetaFixture(ref.owner.name, { state: "Planning", currentWorkflow: null }),
      { kind: "backlog", commitment: "planned" });
    const arrivals: StoreRecord[] = [];
    const result = await f.invoke(["rename", renameUid(source), "renamed", "--json"], beforeRenameBatch(async () => {
      if (arrivals.length !== 0) return;
      arrivals.push(await seed(f, RecordReferenceSchema.parse({ kind: "work-item/notes", owner: source.reference.owner }),
        `# Unsupported: ${ref.owner.name}\n\nUse --plan ${ref.owner.name} plainly.\n`));
      arrivals.push(await seed(f, RecordReferenceSchema.parse({ kind: "work-item/companion", owner: source.reference.owner, key: "appendix.md" }),
        `# Research: ${ref.owner.name}\n\nUse \`--plan ${ref.owner.name}\`.\n`));
      for (const state of ["Active", "Shipped"] as const) {
        const holderRef = f.reference("work-item/meta", state.toLowerCase());
        const holder = await seed(f, holderRef, makeMetaFixture(holderRef.owner.name,
          { state, currentWorkflow: state === "Active" ? "process-task-loop" : null }), state === "Active" ? { kind: "active" } : completed);
        arrivals.push(holder);
        for (const artifact of selfReferenceArtifacts(holder.reference.owner, "title", ref.owner.name, true)) {
          arrivals.push(await seed(f, artifact.reference, artifact.content + `\nUse \`--plan ${ref.owner.name}\`.\n`));
        }
      }
    }));
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    for (const arrival of arrivals) {
      const current = success(await f.store.read({ reference: arrival.reference }));
      expect(current.content).toBe(arrival.content);
      expect(current.reference.owner).toEqual(sameOwner(arrival.reference.owner, source.reference.owner)
        ? { ...arrival.reference.owner, name: "renamed" } : arrival.reference.owner);
    }
    expect(result.result).toMatchObject({ report: { references: [] } });
  }, 60_000);
});
