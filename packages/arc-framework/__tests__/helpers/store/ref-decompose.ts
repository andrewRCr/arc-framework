/** Production-checked decomposition recipes over real native repositories and publication locks. */
import { createRefFixture, type RefFixtureLayout } from "./ref-fixture.js";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createKindRegistry } from "../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";
import { renderMetaFile, writeMetaDependsOn, type MetaRenderOverrides } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences, OwnerIdentitySchema, type RecordReference, type StoreRecord, type WritePlacement } from "../../../src/lib/store/index.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { prepareDecomposePreflight } from "../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../src/lib/decompose/additive.js";
import { decomposeContext } from "../../fixtures/decompose-context.js";
import { completeCutMapFixture } from "../../fixtures/decompose-v4.js";
import { success } from "./suite-tools.js";

/** Seed a bound production map and optionally land its additive batch before a terminal race. */
export async function nativeDecomposeFixture(layout: RefFixtureLayout, options: {
  terminal?: boolean; extraction?: boolean; unknownProvider?: boolean;
} = {}) {
  const f = await createRefFixture({}, layout);
  const ports = { ...f.ports, registry: createKindRegistry(PRODUCTION_REGISTRATIONS) };
  const store = createRefStore(ports), ctx = decomposeContext(store);
  ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const seed = async (reference: RecordReference, content: string, placement?: WritePlacement): Promise<StoreRecord> => {
    const written = success(await store.write({ action: "put", reference, expected: null, content,
      ...(placement === undefined ? {} : { placement }), provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
    return success(await store.read({ reference: written.reference }));
  };
  const seedMeta = async (name: string, fields: MetaRenderOverrides = {}, placement: WritePlacement = { kind: "backlog", commitment: "planned" }): Promise<StoreRecord> => seed(
    recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name })),
    renderMetaFile(name, { state: "Planning", owner: "test-user", workClass: "Light", currentWorkflow: null, ...fields }),
    placement);
  const handEdit = async (record: StoreRecord, content: string): Promise<StoreRecord> => {
    success(await store.write({ ...recordPut(record, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
    return success(await store.read({ reference: record.reference }));
  };
  const primary = await seedMeta("origin", { currentWorkflow: options.extraction ? "draft-design" : null, design: ["draft-origin.md"] }, options.extraction ? { kind: "active" } : undefined);
  const draft = await seed(recordReferences["work-item/draft"](primary.reference.owner), "# Origin\n\n## Scope\n\nOwned work.\n");
  if (options.unknownProvider) {
    const provider = await seedMeta("late-provider");
    await handEdit(primary, writeMetaDependsOn(primary.content, ["late-provider"]));
    if (provider.reference.owner.type !== "work-item") throw new Error("Expected the provider generation");
    // External Git can remove an established provider while its authored edge survives.
    await ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "update-ref", "-d",
      `refs/arc/work/${provider.reference.owner.uid}`], { cwd: f.root });
  }
  if (options.terminal) await seedMeta("consumer", { dependsOn: ["origin"] });
  const prepared = await prepareDecomposePreflight(ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const map = completeCutMapFixture(prepared.result.machine, options.extraction);
  if (options.unknownProvider) for (const edge of map.authoring.outgoingDispositions)
    edge.disposition = { kind: "drop", reason: "The replacement work does not need the departed provider." };
  if (options.terminal) {
    const applied = await runStoreDecomposeAdditive(ctx, "origin", options.extraction ? "extract" : "execute", { cutMap: map, cutMapPath: "cut.json" });
    if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  }
  return { ...f, ports, store, ctx, seed, seedMeta, handEdit, primary, draft, map,
    compete: (operation: () => Promise<void>, boundary = "layout") => {
      let armed = true;
      ctx.executor.store = createRefStore({ ...ports, lock: async (ref, wait) => {
        if (armed && ref === boundary) { armed = false; await operation(); }
        return ports.lock(ref, wait);
      } });
      return () => { if (armed) throw new Error(`The competing operation never reached ${boundary}`); };
    },
  };
}
