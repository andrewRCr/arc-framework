/** A decomposed member enters task generation with the two specifications its cut declared. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { CutMapStarterSchema } from "../../src/lib/decompose/cut-map-schema.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedStore } from "../helpers/store/seed-store.js";
import {
  lifecycleRepository, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS, readLifecycleMeta,
} from "../helpers/store-lifecycle-fixture.js";

it("starts a paired-spec member through init with both declared files ready for task generation", async () => {
  const h = await lifecycleRepository();
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "origin" });
  const forms = ["prd", "rfc"] as const;
  await seedStore(h.repo, LIFECYCLE_IDENTITY, [
    { reference: recordReferences["work-item/meta"](owner), placement: { kind: "backlog", commitment: "planned" },
      content: makeMetaFixture("origin", { state: "Planning", workClass: "Heavy", currentWorkflow: null,
        design: forms.map(form => `spec-origin-${form}.md`) }) },
    ...forms.map(form => ({ reference: recordReferences["work-item/companion"](owner, `spec-${form}`),
      content: `# origin ${form}\n\n## Scope\n\nOwn the ${form} work.\n` })),
  ]);
  const preflight = await h.run(["decompose", "origin", "--preflight"]);
  expect(preflight.exitCode, preflight.output).toBe(0);
  const map = completeCutMapFixture(CutMapStarterSchema.parse(JSON.parse(preflight.stdout)).machine);
  map.authoring.sourceAllocations = map.machine.sourceUnits.map(({ sourceId, sourceLocator }) => {
    const destinationId = sourceLocator.artifact.endsWith("-prd.md") ? "member-a" : "member-b";
    return { sourceId, ownership: "destination-owned", disposition: { kind: "target", destinationId,
      targetLocator: { ...sourceLocator, artifact: sourceLocator.artifact.replace("origin", destinationId) } } };
  });
  const mapPath = join(h.repo, ".git", "cut.json");
  await writeFile(mapPath, JSON.stringify(map));
  const cut = await h.run(["decompose", "origin", "--execute", mapPath]);
  expect(cut.exitCode, cut.output).toBe(0);

  const name = "member-b";
  const checkout = h.checkoutPath(name);
  const start = await h.run(["start", name, "--yes"]);
  expect(start.exitCode, start.output).toBe(0);
  const design = forms.map(form => `spec-${name}-${form}.md`);
  const taskInputs = { placement: { kind: "active" }, fields: { currentWorkflow: "generate-tasks", design } };
  expect(await readLifecycleMeta(checkout, name)).toMatchObject(taskInputs);

  const workflow = "system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md";
  const init = await readFile(join(checkout, ".arc", workflow), "utf8");
  const stubPath = init.split("**Path A — Started from a stub**")[1]?.split("**Path B")[0] ?? "";
  // Follow an unconditional repoint for specified stubs if the workflow calls for one.
  if (/for a stub specified before its start,\s+run `arc repoint-design spec-finalized`/u.test(stubPath)) {
    const repoint = await h.run(["repoint-design", "spec-finalized"], checkout);
    expect.soft(repoint.exitCode, repoint.output).toBe(0);
  }
  expect(stubPath).toMatch(/preserve[^.]*PRD\/RFC pair[^.]*`generate-tasks`/iu);
  expect(stubPath).toMatch(/singleton spec[^.]*run `arc repoint-design spec-finalized`/u);
  expect(init.split("### 5)")[1]).toMatch(/`generate-tasks`[^.]*every spec in `Design`/u);

  expect(await readLifecycleMeta(checkout, name)).toMatchObject(taskInputs);
  for (const [index, filename] of design.entries()) {
    expect(await readFile(join(checkout, ".arc/active/current", filename), "utf8")).toContain(`# ${name} ${forms[index]}`);
  }
}, LIFECYCLE_TIMEOUT_MS);
