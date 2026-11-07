/** Registered archive dispatch retains former-name holders on both operational backends. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { writeCohortParent } from "../../src/lib/store/kinds/cohort/identity-writers.js";
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

it("archive advice clears every child member before changing its former Parent", async () => {
  const cli = await repairCliFixture(), f = await createRefFixture(overrides);
  const options = { storeFactory: async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: f.ports.registry, identity: f.ports.identity,
      actor: f.ports.actor, clock: f.ports.clock, random: f.ports.random });
  } };
  const parentRef = f.reference("cohort/document", "parent"), childRef = f.reference("cohort/document", "child");
  const otherRef = f.reference("cohort/document", "other"), oldPath = `${parentRef.owner.name}/${childRef.owner.name}`;
  const parent = await seed(f, parentRef, content(parentRef.owner.name));
  await seed(f, otherRef, content(otherRef.owner.name));
  const child = await seed(f, childRef, content(childRef.owner.name).replace("**Parent:** [none]", `**Parent:** \`${parentRef.owner.name}\``));
  const members = [];
  for (const name of ["former-member", "current-prefix-member", "subject"]) {
    const reference = f.reference("work-item/meta", name);
    members.push(await seed(f, reference, makeMetaFixture(reference.owner.name, { cohort: oldPath })));
  }
  const [former, current, subject] = members;
  if (former === undefined || current === undefined || subject === undefined || current.reference.owner.type === "person"
    || current.reference.owner.uid === undefined) throw new Error("Expected exact member identities");
  await plantRefPrimary(f, { kind: "work-item/meta", name: current.reference.owner.name, uid: current.reference.owner.uid,
    content: writeMetaCohort(current.content, `${otherRef.owner.name}/${childRef.owner.name}`) });
  const renamed = RecordReferenceSchema.parse({ ...parent.reference, owner: { ...parent.reference.owner, name: "renamed" } });
  success(await f.store.write({ ...update(f, parent, content("renamed")), reference: renamed }));
  const archived = await repairCli(cli, ["archive", subject.reference.owner.name], options);
  expect(archived.exitCode ?? 0, archived.stdout + archived.stderr).toBe(0);
  const notice = archived.stdout.split("\n").find(line => line.includes(`Cohort ${childRef.owner.name} remains open.`));
  expect(notice).toBeDefined();
  const edits = [...(notice ?? "").matchAll(/(work-unit|cohort) ([\w-]+) \(UID ([^)]+)\): (Cohort|Parent) (null|"[^"]*") -> (null|"[^"]*")\./gu)];
  expect(edits).toHaveLength(5);
  expect(edits.map(edit => edit[4])).toEqual(["Cohort", "Cohort", "Parent", "Cohort", "Cohort"]);
  for (const edit of edits) {
    const reference = RecordReferenceSchema.parse({ kind: edit[4] === "Parent" ? "cohort/document" : "work-item/meta",
      owner: { type: edit[1] === "cohort" ? "cohort" : "work-item", name: edit[2], uid: edit[3] } });
    const saved = success(await f.store.read({ reference }));
    const to: string | null = JSON.parse(edit[6] ?? "null");
    const next = edit[4] === "Cohort" ? writeMetaCohort(saved.content, to) : to === null ? null : writeCohortParent(saved.content, to);
    if (next === null) throw new Error("Expected a Parent repair");
    success(await f.store.write(update(f, saved, next)));
  }
  for (const member of [former, current]) expect(success(await f.store.read({ reference: member.reference })).fields)
    .toMatchObject({ cohort: `renamed/${childRef.owner.name}` });
  expect(success(await f.store.read({ reference: child.reference })).fields).toMatchObject({ parent: "renamed" });
  const retried = await repairCli(cli, ["archive", subject.reference.owner.name], options);
  expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
  expect(retried.stdout).not.toContain("remains open");
  expect(success(await f.store.read({ reference: subject.reference })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: child.reference })).placement?.kind).not.toBe("completed");
}, 60_000);
