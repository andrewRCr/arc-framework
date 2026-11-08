/** Prepared renames land only where fresh preparation over the landing state agrees with the submitted batch. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema, recordReferences } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { candidateRecordFixture } from "../fixtures/review-candidate.js";
import { serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { prepareStoreRename, readStoreRenameSubject, submitStoreRename } from "../../src/lib/store/lifecycle-rename.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { seedStatusConflict } from "../helpers/store/status-conflicts.js";
import { readRenameResolution } from "../../src/lib/store/rename-reference-resolution.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreRecord } from "../../src/lib/store/read.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const planned = { kind: "backlog" as const, commitment: "planned" as const };

async function fixture(backend: "reference" | "ref") {
  const cli = await repairCliFixture();
  const native = backend === "ref" ? await createRefFixture(production) : undefined;
  const state = native ?? createReferenceFixture({}, production);
  const open = async (): Promise<Store> => {
    if (native === undefined) return state.store;
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: native.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: native.ports.registry, identity: native.ports.identity,
      actor: native.ports.actor, clock: native.ports.clock, random: native.ports.random });
  };
  const namesake = async (name: string) => {
    if (native === undefined) throw new Error("Concurrent name-read ties require the native fixture");
    const content = makeMetaFixture(name, { state: "Planning", currentWorkflow: null });
    return success(await state.store.read({ reference: await plantRefPrimary(native,
      { kind: "work-item/meta", name, uid: "12345678-abcd-4abc-8abc-123456789abc", content }) }));
  };
  const stub = (name: string, dependsOn: string[] = []) => seed(state, state.reference("work-item/meta", name),
    makeMetaFixture(name, { state: "Planning", currentWorkflow: null, dependsOn }), planned);
  return { ...state, namesake, stub, invoke: (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, {
    storeFactory: async () => { const store = await open(); return decorate?.(store) ?? store; },
  }) };
}

function beforeBatch(inject: () => Promise<void>): (store: Store) => Store {
  let injected = false;
  return store => new Proxy(store, { get(target, key) {
    if (key === "batch") return async (input: Parameters<Store["batch"]>[0]) => {
      if (!injected) { injected = true; await inject(); }
      return store.batch(input);
    };
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

function uid(record: StoreRecord): string {
  const owner = record.reference.owner;
  if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected an exact owner");
  return owner.uid;
}

async function expectUnchanged(f: Awaited<ReturnType<typeof fixture>>, records: readonly StoreRecord[]): Promise<void> {
  for (const record of records) expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
}

describe.each(["reference", "ref"] as const)("work-unit rename preparation at admission over %s", backend => {
  it("admits a batch when an unrelated stub's artifact changes after preparation", async () => {
    const f = await fixture(backend), source = await f.stub("example"), other = await f.stub("unrelated");
    const draft = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/draft", owner: other.reference.owner }),
      "# Draft: unrelated\n\nNo citation here.\n");
    const landed = await f.invoke(["rename", uid(source), "renamed", "--json"], beforeBatch(async () => {
      success(await f.store.write(update(f, draft, "# Draft: unrelated\n\nEdited elsewhere.\n")));
    }));
    expect(landed.exitCode ?? 0, landed.stdout + landed.stderr).toBe(0);
    expect(success(await f.store.read({ reference: source.reference })).reference.owner.name).toBe("renamed");
  }, 60_000);

  it("refuses a batch when a Candidate arrives after preparation", async () => {
    const f = await fixture(backend), source = await f.stub("example");
    const candidate = recordReferences["review/candidate"](source.reference.owner);
    let version: unknown;
    const refused = await f.invoke(["rename", uid(source), "renamed", "--json"], beforeBatch(async () => {
      await seed(f, candidate, serializeCandidateManagedRecord(candidateRecordFixture().record));
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, JSON.stringify(refused.result)).toBe(1);
    expect(refused.result).toMatchObject({ refusal: { code: "version-conflict", records: [candidate] } });
    expect(success(await f.store.version())).toBe(version);
    await expectUnchanged(f, [source]);
  }, 60_000);

  it("refuses a batch when a quietly named owned companion arrives, then rewrites its citations on retry", async () => {
    const f = await fixture(backend), source = await f.stub("example");
    const name = source.reference.owner.name;
    const spec = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/spec", owner: source.reference.owner }),
      `# Spec (\`brief\`): ${name}\n\nSee \`api-research-${name}.md\`.\n`);
    const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: source.reference.owner, key: "api-research" });
    let arrived: StoreRecord | undefined, version: unknown;
    const argv = ["rename", uid(source), "renamed", "--json"];
    const refused = await f.invoke(argv, beforeBatch(async () => {
      arrived = await seed(f, companion, "# API notes\n\nBody.\n");
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, JSON.stringify(refused.result)).toBe(1);
    expect(refused.result).toMatchObject({ refusal: { rule: "rename.preparation",
      condition: expect.stringContaining("differs from preparing it again") } });
    expect(success(await f.store.version())).toBe(version);
    await expectUnchanged(f, [source, spec, ...(arrived === undefined ? [] : [arrived])]);
    const retried = await f.invoke(argv);
    expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
    expect(success(await f.store.read({ reference: spec.reference })).content).toContain("`api-research-renamed.md`");
  }, 60_000);
});

describe("work-unit rename name resolution at admission over ref", () => {
  it("refuses a batch whose shared rewrites a departing namesake would change, then rewrites on retry", async () => {
    const f = await fixture("ref"), source = await f.stub("example"), name = source.reference.owner.name;
    const waiting = await f.stub("waiting", [name]), namesake = await f.namesake(name);
    expect(await readRenameResolution(f.store, source.reference, name)).toMatchObject({ status: "ok", result: { resolution: "ambiguous" } });
    let version: unknown;
    const argv = ["rename", uid(source), "renamed", "--json"];
    const refused = await f.invoke(argv, beforeBatch(async () => {
      success(await f.store.write({ action: "remove", reference: namesake.reference, expected: namesake.version,
        provenance: { verb: "remove", lifecycleAction: "remove" } }));
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, JSON.stringify(refused.result)).toBe(1);
    expect(refused.result).toMatchObject({ refusal: { code: "version-conflict", records: [namesake.reference] } });
    expect(success(await f.store.version())).toBe(version);
    await expectUnchanged(f, [source, waiting]);
    const retried = await f.invoke(argv);
    expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
    expect(success(await f.store.read({ reference: waiting.reference })).fields).toMatchObject({ dependsOn: ["renamed"] });
  }, 60_000);

  it("refuses a batch whose shared rewrites an arriving namesake would withhold, then leaves them on retry", async () => {
    const f = await fixture("ref"), source = await f.stub("example"), name = source.reference.owner.name;
    const waiting = await f.stub("waiting", [name]);
    let version: unknown;
    const argv = ["rename", uid(source), "renamed", "--json"];
    const refused = await f.invoke(argv, beforeBatch(async () => {
      await f.namesake(name);
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, JSON.stringify(refused.result)).toBe(1);
    expect(refused.result).toMatchObject({ refusal: { rule: "rename.preparation" } });
    expect(success(await f.store.version())).toBe(version);
    await expectUnchanged(f, [source, waiting]);
    const retried = await f.invoke(argv);
    expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
    expect(success(await f.store.read({ reference: waiting.reference })).fields).toMatchObject({ dependsOn: [name] });
  }, 60_000);

  it("refuses a batch when a citing stub arrives under a tied name, then reports it on retry", async () => {
    const f = await fixture("ref"), source = await f.stub("example"), name = source.reference.owner.name;
    await f.namesake(name);
    const citing = f.reference("work-item/meta", "citing"), citation = `See \`spec-${name}.md\`.`;
    const content = `${makeMetaFixture(citing.owner.name, { state: "Planning", currentWorkflow: null })}\n${citation}\n`;
    let arrived: StoreRecord | undefined, version: unknown;
    const argv = ["rename", uid(source), "renamed", "--json"];
    const refused = await f.invoke(argv, beforeBatch(async () => {
      arrived = await seed(f, citing, content, planned);
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, JSON.stringify(refused.result)).toBe(1);
    expect(refused.result).toMatchObject({ refusal: { rule: "rename.preparation" } });
    expect(success(await f.store.version())).toBe(version);
    if (arrived === undefined) throw new Error("Expected arrival");
    await expectUnchanged(f, [source, arrived]);
    const retried = await f.invoke(argv);
    expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
    await expectUnchanged(f, [arrived]);
    expect(retried.result).toMatchObject({ report: { references: expect.arrayContaining([{
      record: { type: "work-unit", name: arrived.reference.owner.name, uid: uid(arrived) },
      edits: [{ kind: "text", document: arrived.reference, line: content.split("\n").indexOf(citation) + 1,
        replacement: "See `spec-renamed.md`." }] }]) } });
  }, 60_000);
});

describe.each(["reference", "ref"] as const)("work-unit rename advisory and branch evidence at admission over %s", backend => {
  it("refuses a batch when an Integrating dependent arrives, then reports it on retry", async () => {
    const f = await fixture(backend), source = await f.stub("example"), name = source.reference.owner.name;
    const dependent = f.reference("work-item/meta", "integrating");
    let version: unknown;
    const argv = ["rename", uid(source), "renamed", "--json"];
    const refused = await f.invoke(argv, beforeBatch(async () => {
      await seed(f, dependent, makeMetaFixture(dependent.owner.name, { state: "Integrating", dependsOn: [name] })
        + "\n## Completion Notes\n\nDelivered the work unit.\n", { kind: "active" });
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, JSON.stringify(refused.result)).toBe(1);
    expect(refused.result).toMatchObject({ refusal: { rule: "rename.preparation",
      condition: expect.stringContaining("does not observe") } });
    expect(success(await f.store.version())).toBe(version);
    await expectUnchanged(f, [source]);
    const retried = await f.invoke(argv);
    expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
    expect(retried.result).toMatchObject({ advisories: [expect.stringContaining(dependent.owner.name)] });
  }, 60_000);

  it("refuses a batch moving a branch link another holder claims, then keeps the link on retry", async () => {
    const f = await fixture(backend), seeded = await f.stub("example"), other = await f.stub("holder");
    const link = { repository: "12345678-abcd-4abc-8abc-1234567890ff", ref: "feat/example", linkedAs: "created" as const, excluded: [] };
    success(await f.store.write({ ...recordPut(seeded, { links: { branches: [link] } }), provenance: { verb: "fixture", lifecycleAction: "link" } }));
    const primary = success(await f.store.read({ reference: seeded.reference }));
    const subject = success(await readStoreRenameSubject(f.store, { primary, operand: uid(primary), targetSlug: "renamed" }));
    const branch = { prior: link, next: { ...link, ref: "feat/renamed" }, checkoutHere: false };
    const prepared = success(await prepareStoreRename(f.store, subject, "renamed", branch));
    expect(prepared.branch?.local).toBe(true);
    success(await f.store.write({ ...recordPut(other, { links: { branches: [link] } }), provenance: { verb: "fixture", lifecycleAction: "link" } }));
    const version = success(await f.store.version());
    expect(await submitStoreRename(f.store, prepared)).toMatchObject({ status: "refused", refusal: { rule: "rename.preparation" } });
    expect(success(await f.store.version())).toBe(version);
    const fresh = success(await prepareStoreRename(f.store, subject, "renamed", branch));
    expect(fresh.branch?.local).toBe(false);
    success(await submitStoreRename(f.store, fresh));
    const renamed = success(await f.store.read({ reference: primary.reference }));
    expect(renamed.reference.owner.name).toBe("renamed");
    expect(renamed.links?.branches).toEqual([link]);
  }, 60_000);
});

describe("archive closeout over reference", () => {
  it("refuses an archive batch when the cohort it completes gains a conflict, leaving both open", async () => {
    const f = await fixture("reference"), groupRef = f.reference("cohort/document", "group");
    const group = await seed(f, groupRef, `# Cohort: \`${groupRef.owner.name}\`\n\n**Parent:** [none]\n\n**Purpose:** Deliver the group.\n`);
    const subjectRef = f.reference("work-item/meta", "subject");
    const subject = await seed(f, subjectRef, makeMetaFixture(subjectRef.owner.name, { cohort: groupRef.owner.name }));
    let version: unknown;
    const refused = await f.invoke(["archive", subjectRef.owner.name], beforeBatch(async () => {
      await seedStatusConflict(f, RecordReferenceSchema.parse({ kind: "cohort/conflict-record", owner: group.reference.owner, key: "arrived" }));
      version = success(await f.store.version());
    }));
    expect(refused.exitCode, refused.stdout + refused.stderr).toBe(1);
    expect(success(await f.store.version())).toBe(version);
    expect(success(await f.store.read({ reference: group.reference })).placement?.kind).not.toBe("completed");
    expect(success(await f.store.read({ reference: subject.reference })).placement?.kind).not.toBe("completed");
  }, 60_000);
});
