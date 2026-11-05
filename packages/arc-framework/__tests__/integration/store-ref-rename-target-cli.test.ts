/** Rename target admission shares creation's ranked namespace over both backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";

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
  return { ...state, cli, invoke: (args: readonly string[]) => repairCli(cli, args, { storeFactory }) };
}

describe.each(["reference", "ref"] as const)("rename target admission over %s", backend => {
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
