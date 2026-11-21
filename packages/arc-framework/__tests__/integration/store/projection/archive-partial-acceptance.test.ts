import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createErrandAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { success, update } from "../../../helpers/store/suite-tools.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { sameReference } from "../../../../src/lib/store/identity.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

it.each([false, true])("plain save retains a partial Markdown landing made during persist, refused read=%s", async refuseRead => {
  const { f, folder, description } = await createErrandAdoptionFixture({ completed: true });
  const path = folder + "/errand-alpha.md", file = join(f.root, path);
  const base = "## Description\n\n### First\n\n- _Id:_ `11111111`\n\nbase first\n\n"
    + "### Second\n\n- _Id:_ `22222222`\n\nbase second\n";
  success(await f.store.write(update(f, description, base)));
  const starting = success(await f.store.read({ reference: description.reference }));
  success(await f.store.write(update(f, starting, base.replace("base first", "stored first"))));
  success(await f.store.write(update(f, starting, base.replace("base first", "incoming first"))));
  let submissions = 0, deny = false, refused = false;
  const store = overrideEngineStore(f.store, { batch: async input => {
    const result = await f.store.batch(input);
    if (result.status === "ok" && result.result.writes.some(each => sameReference(each.reference, description.reference))) {
      submissions++;
      if (submissions === 1 && refuseRead) deny = true;
    }
    return result;
  }, read: async input => {
    if (deny && sameReference(input.reference, description.reference)) {
      deny = false;
      refused = true;
      return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "archive", condition: "Read unavailable.",
        remedy: { text: "Retry the read." } } };
    }
    return f.store.read(input);
  } });
  const command = { checkout: f.root, store };
  await projectionCommand(command, ["status"]);
  expect((await projectionCommand(command, ["edit", file])).result).toMatchObject({ status: "ok" });
  const original = await readFile(file, "utf8");
  expect(original).toContain("=======");
  const edited = original.replace(/^=======\n/mu, "").replace("stored first", "held first edit").replace("base second", "accepted second edit");
  await writeFile(file, edited);
  const result = await persistProjectionRemoval(f.root, { store, identity: SlugSchema.parse("andrew") });
  expect(result).toMatchObject({ kind: "refused" });
  expect(refused).toBe(refuseRead);
  expect(submissions).toBe(1);
  expect(success(await f.store.read({ reference: description.reference })).content).toContain("accepted second edit");
  const save = await projectionCommand(command, ["save"]);
  expect.soft(await readFile(file, "utf8")).toBe(edited);
  expect.soft(save.diagnostics).toContain("marker-malformed");
  expect(submissions).toBe(1);
});
