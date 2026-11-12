/** Registered lifecycle advice keeps a former parent name subordinate to the open leaf's Parent. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const production = createKindRegistry(PRODUCTION_REGISTRATIONS);
const overrides = { "work-item/meta": production["work-item/meta"], "cohort/document": production["cohort/document"] };
const document = (name: string, parent: string | null = null) =>
  `# Cohort: \`${name}\`\n\n**Parent:** ${parent === null ? "[none]" : `\`${parent}\``}\n\n**Purpose:** Coordinate work.\n`;

describe.each(["close", "remove", "archive"] as const)("%s advice over a former parent name", operation => {
  it.each(operation === "remove" ? ["other"] as const : ["other", "top-level", "unresolved"] as const)("preserves valid advice when the open leaf's Parent is %s", async mode => {
    const cli = await repairCliFixture(), f = await createRefFixture(overrides);
    const options = { storeFactory: async () => {
      const { createRefStore } = await import("../../src/lib/store/create.js");
      const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
      const ports = createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null });
      return createRefStore({ ...ports, registry: f.ports.registry, identity: f.ports.identity,
        actor: f.ports.actor, clock: f.ports.clock, random: f.ports.random });
    } };
    const groupRef = f.reference("cohort/document", "former-parent"), otherRef = f.reference("cohort/document", "other");
    const group = await seed(f, groupRef, document(groupRef.owner.name));
    await seed(f, otherRef, document(otherRef.owner.name));
    const parent = mode === "top-level" ? null : mode === "other" ? otherRef.owner.name : "missing-parent";
    const leaf = await plantRefPrimary(f, { kind: "cohort/document", name: "leaf",
      uid: "00000000-0000-4000-8000-000000000001", content: document("leaf", parent) });
    const path = `${groupRef.owner.name}/leaf`;
    const stale = await plantRefPrimary(f, { kind: "work-item/meta", name: "stale-member",
      uid: "00000000-0000-4000-8000-000000000002", content: makeMetaFixture("stale-member", { cohort: path }) });
    const staleBefore = success(await f.store.read({ reference: stale }));
    const validRef = f.reference("work-item/meta", "valid-member");
    const valid = await seed(f, validRef, makeMetaFixture(validRef.owner.name, { cohort: groupRef.owner.name }));
    const renamed = RecordReferenceSchema.parse({ ...group.reference, owner: { ...group.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, group, document("renamed")), reference: renamed }));
    const subjectRef = f.reference("work-item/meta", "subject");
    if (operation === "archive") await seed(f, subjectRef, makeMetaFixture(subjectRef.owner.name, { cohort: "renamed" }));
    const before = success(await f.store.version());
    const args = operation === "archive" ? ["archive", subjectRef.owner.name]
      : ["cohort", operation, "renamed", "--yes", "--json"];
    const result = await repairCli(cli, args, options);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(operation === "archive" ? 0 : 1);
    const advice = operation === "archive" ? result.stdout
      : (result.result as { refusal: { condition: string } }).refusal.condition;
    if (operation === "remove") expect(advice).not.toContain("Re-pointing edits");
    else expect(advice).toContain(`Cohort "${groupRef.owner.name}" -> "renamed"`);
    expect(advice).toContain(stale.owner.name);
    expect(advice).not.toContain(`Cohort "${path}" -> "renamed/leaf"`);
    if (mode === "top-level") expect(advice).toContain(`Cohort "${path}" -> "leaf"`);
    else expect(advice).not.toContain(`Cohort "${path}" ->`);
    expect(success(await f.store.read({ reference: stale }))).toEqual(staleBefore);
    expect(success(await f.store.read({ reference: valid.reference }))).toEqual(valid);
    expect(success(await f.store.read({ reference: leaf })).fields).toMatchObject({ parent });
    if (operation !== "archive") expect(success(await f.store.version())).toBe(before);
    success(await f.store.write(update(f, valid, writeMetaCohort(valid.content, "renamed"))));
    if (mode === "top-level") {
      success(await f.store.write(update(f, staleBefore, writeMetaCohort(staleBefore.content, "leaf"))));
      expect(success(await f.store.read({ reference: stale })).fields).toMatchObject({ cohort: "leaf" });
    } else success(await f.store.write(update(f, staleBefore, writeMetaCohort(staleBefore.content, null))));
    const repairedValid = success(await f.store.read({ reference: valid.reference }));
    success(await f.store.write(update(f, repairedValid, writeMetaCohort(repairedValid.content, null))));
    const retry = await repairCli(cli, args, options);
    expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
    if (operation === "remove") expect(await f.store.read({ reference: renamed }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    else expect(success(await f.store.read({ reference: renamed })).placement?.kind).toBe("completed");
  }, 60_000);
});
