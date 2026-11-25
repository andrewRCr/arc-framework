/** Saves fired alongside the complete refresh path, using the shared loss detector in every editor mode. */
import { afterEach, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { runSaveLoss, SAVE_MODES, startSaver } from "../../../helpers/store/projection/save-loss.js";
import { SWAP_PATH } from "../../../helpers/store/projection/swap-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { COHORT_REGISTRATION } from "../../../../src/lib/store/kinds/cohort/registration.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

for (const mode of SAVE_MODES) {
  it(`loses no ${mode} save timed into a store-driven refresh`, async () => {
    const fixture = createReferenceFixture(undefined, { "cohort/document": { parser: COHORT_REGISTRATION.parser } });
    const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "one" } });
    const put = await fixture.store.write({ action: "put", reference, content: "# Cohort: one\n\nBody.\n", expected: null,
      provenance: { verb: "save", lifecycleAction: "save" } });
    if (put.status !== "ok") throw new Error("The fixture write was refused");
    const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path: SWAP_PATH }] });
    directories.push(seeded.checkout);
    const saver = startSaver();
    try {
      const result = await runSaveLoss({ store: fixture.store, reference, seeded, path: SWAP_PATH, mode, cycles: 12,
        saver, random: Math.random, operation: "refresh" });
      expect(result.operations.refresh).toBe(12);
      expect(Object.values(result.outcomes).reduce((sum, count) => sum + count, 0)).toBe(12);
      expect(result.losses).toEqual([]);
    } finally {
      await saver.close();
    }
  }, 90_000);
}
