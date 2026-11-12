/** A rename sweeps every Planning stub, including stubs that share one current name. */
import { expect, it } from "vitest";
import { createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import type { StoreRecord } from "../../src/lib/store/read.js";

const planned = { kind: "backlog" as const, commitment: "planned" as const };

it("rewrites the citations of two Planning stubs that share a name", async () => {
  const cli = await repairCliFixture(), f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  const sourceRef = f.reference("work-item/meta", "example"), name = sourceRef.owner.name;
  const source = await seed(f, sourceRef, makeMetaFixture(name, { state: "Planning", currentWorkflow: null }), planned);
  const stub = (dup: string) => `${makeMetaFixture(dup, { state: "Planning", currentWorkflow: null, dependsOn: [name] })}\nSee \`spec-${name}.md\`.\n`;
  const firstRef = f.reference("work-item/meta", "dup"), dup = firstRef.owner.name;
  const first = await seed(f, firstRef, stub(dup), planned);
  const planted = success(await f.store.read({ reference: await plantRefPrimary(f, { kind: "work-item/meta", name: dup,
    uid: "12345678-abcd-4abc-8abc-123456789abc", content: stub(dup), placement: planned }) }));
  expect(planted.placement).toEqual(planned);
  const owner = source.reference.owner;
  if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected the source UID");
  const result = await repairCli(cli, ["rename", owner.uid, "renamed", "--json"], { storeFactory: async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: f.ports.registry, identity: f.ports.identity,
      actor: f.ports.actor, clock: f.ports.clock, random: f.ports.random });
  } });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  for (const record of [first, planted] as StoreRecord[]) {
    const swept = success(await f.store.read({ reference: record.reference }));
    expect(swept.fields).toMatchObject({ dependsOn: ["renamed"] });
    expect(swept.content).toContain("`spec-renamed.md`");
  }
}, 60_000);
