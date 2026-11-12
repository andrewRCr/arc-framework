/** Store write rules preserve the recovery instructions of ambiguous references. */
import { expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { success, update } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const uids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"] as const;
const cohort = (name: string, parent?: string) => `# Cohort: ${name}\n\n${parent ? `**Parent:** \`${parent}\`\n\n` : ""}**Purpose:** Coordinate members.\n`;
const meta = (cohortPath: string | null = null, dependsOn: string[] = []) => makeMetaFixture("work-item-member",
  { cohort: cohortPath, dependsOn, owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" });

it.each(["Cohort", "Parent"] as const)("a changed %s reports the clashed cohort's repair", async field => {
  const f = await createRefFixture();
  const store = createRefStore({ ...f.ports, registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
  const reference = await plantRefPrimary(f, { kind: field === "Cohort" ? "work-item/meta" : "cohort/document",
    name: field === "Cohort" ? "work-item-member" : "cohort-child", uid: "00000000-0000-4000-8000-000000000005",
    content: field === "Cohort" ? meta() : cohort("cohort-child") });
  const primary = success(await store.read({ reference }));
  for (const uid of uids.slice(0, 2)) await plantRefPrimary(f, { kind: "cohort/document", name: "shared", uid, content: cohort("shared") });
  const content = field === "Cohort" ? meta("shared") : cohort("cohort-child", "shared");
  expect(await store.write(update(f, primary, content))).toMatchObject({ status: "refused", refusal: {
    code: "record-malformed", rule: field === "Cohort" ? "meta.cohort" : "cohort.parent",
    remedy: { text: expect.stringContaining(`arc rename ${uids[0]} <new-slug>`), argv: ["arc", "status", "--json"] },
  } });
});

it.each([false, true])("dependency ambiguities retain their repairs (multiple=%s)", async multiple => {
  const f = await createRefFixture();
  const store = createRefStore({ ...f.ports, registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", name: "work-item-member",
    uid: "00000000-0000-4000-8000-000000000005", content: meta() });
  const primary = success(await store.read({ reference }));
  await plantRefPrimary(f, { kind: "work-item/meta", name: "left", uid: uids[0] });
  await plantRefPrimary(f, { kind: "work-item/record", name: "left", uid: uids[1] });
  if (multiple) for (const uid of uids.slice(2)) await plantRefPrimary(f, { kind: "work-item/meta", name: "right", uid });
  const result = await store.write(update(f, primary, meta(null, multiple ? ["left", "right"] : ["left"])));
  expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "meta.depends-on",
    remedy: { text: expect.stringContaining(`arc errand close ${uids[1]}`),
      argv: multiple ? ["arc", "status", "--json"] : ["arc", "errand", "close", uids[1]] },
  } });
  if (result.status !== "refused") throw new Error("Expected dependency refusal");
  if (multiple) for (const uid of uids.slice(2)) expect(result.refusal.remedy.text).toContain(`arc rename ${uid} <new-slug>`);
});
