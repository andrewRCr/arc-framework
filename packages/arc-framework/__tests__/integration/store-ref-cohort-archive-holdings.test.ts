/** Registered archive dispatch retains former-name holders on both operational backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const content = (name: string) => `# Cohort: \`${name}\`\n\n**Parent:** [none]\n\n**Purpose:** Deliver the group.\n`;

describe.each(["reference", "ref"] as const)("registered archive holdings over %s", backend => {
  it("archives and reports a former-name stub once, then closes after the stub leaves", async () => {
    const cli = await repairCliFixture();
    const refFixture = backend === "ref" ? await createRefFixture(overrides) : undefined;
    const f = refFixture ?? createReferenceFixture({}, overrides);
    const options = refFixture === undefined ? { store: f.store } : { storeFactory: async () => {
      const { createRefStore } = await import("../../src/lib/store/create.js");
      const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
      const fresh = createDefaultRefStorePorts({ checkoutRoot: refFixture.root, backingRepository: async () => null });
      return createRefStore({ ...fresh, registry: refFixture.ports.registry, identity: refFixture.ports.identity,
        actor: refFixture.ports.actor, clock: refFixture.ports.clock, random: refFixture.ports.random });
    } };
    const groupRef = f.reference("cohort/document", "group"), memberRef = f.reference("work-item/meta", "straggler");
    const group = await seed(f, groupRef, content(groupRef.owner.name));
    const held = await seed(f, memberRef, makeMetaFixture(memberRef.owner.name, { state: "Planning", cohort: groupRef.owner.name }),
      { kind: "backlog", commitment: "planned" });
    const renamed = RecordReferenceSchema.parse({ ...group.reference, owner: { ...group.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, group, content("renamed")), reference: renamed }));
    if (refFixture !== undefined) {
      for (const uid of ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]) {
        await plantRefPrimary(refFixture, { kind: "cohort/document", name: "other-clash", uid, content: content("other-clash") });
      }
      await plantRefPrimary(refFixture, { kind: "work-item/meta", name: "other-member", uid: "00000000-0000-4000-8000-000000000003",
        content: makeMetaFixture("other-member", { cohort: "other-clash" }) });
    }
    const subjectRef = f.reference("work-item/meta", "subject");
    const subject = await seed(f, subjectRef, makeMetaFixture(subjectRef.owner.name, { cohort: "renamed" }));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await repairCli(cli, ["archive", subjectRef.owner.name], options);
      expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
      expect(result.stdout.match(/Cohort renamed remains open/gu)).toHaveLength(1);
      expect(result.stdout).toContain(memberRef.owner.name);
      expect(result.stdout).toContain(`Cohort "${groupRef.owner.name}" -> "renamed"`);
      expect(success(await f.store.read({ reference: renamed })).placement?.kind).not.toBe("completed");
      expect(success(await f.store.read({ reference: subject.reference })).placement?.kind).toBe("completed");
      expect(success(await f.store.read({ reference: held.reference }))).toEqual(held);
    }
    success(await f.store.write(update(f, held, writeMetaCohort(held.content, null))));
    const settled = await repairCli(cli, ["archive", subjectRef.owner.name], options);
    expect(settled.exitCode ?? 0, settled.stdout + settled.stderr).toBe(0);
    expect(settled.stdout).not.toContain("Cohort renamed remains open");
    expect(success(await f.store.read({ reference: renamed })).placement?.kind).toBe("completed");
  }, 60_000);
});
