/** Typed admission conflicts preserve an already accepted input without retrying or discarding history. */
import { expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { success, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";
import { createHistoryMemo } from "../../src/lib/store/projection/base-recovery.js";
import { recordReferences, RecordVersionSchema, type RecordReference } from "../../src/lib/store/identity.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createStagedFile, nameAsideFile } from "../../src/lib/store/projection/aside.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) for (const aside of [false, true]) {
  it(`keeps accepted input, payload and recovery allowance after one refused submission: ${backend}/${aside}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f, kind: "work-item/notes", content: "opening\nbase\nclosing\n" });
    try {
      await h.edit("opening\naccepted\nclosing\n");
      const accepted = await createWriteBackPort(h.context)(h.request);
      expect(accepted.answer).toBe("taken-in");
      expect(accepted.entry.persisted).not.toBeNull();
      const text = "opening\nnew authored edit\nclosing\n";
      await h.edit(text);
      const copy = aside ? nameAsideFile({ path: h.path, base: h.entry.base.blob, writer: h.context.writer, role: "aside" }) : null;
      if (copy !== null) {
        await createStagedFile(h.checkout, copy, await h.file());
        await writeFile(join(h.checkout, h.path), "Independent live bytes.\n");
      }
      const payload = () => readFile(join(h.checkout, copy ?? h.path), "utf8");
      const bytes = await payload(), live = await h.file();
      const primary = success(await f.store.read({ reference: recordReferences["work-item/meta"](h.entry.reference.owner) }));
      let submissions = 0, drops = 0;
      const store = overrideEngineStore(f.store, { batch: async input => {
        if (input.projectionAdmission) {
          submissions++;
          if (submissions === 1) success(await f.store.write({ ...update(f, primary,
            writeMetaOwner(primary.content, SlugSchema.parse("another-user"))), provenance: { verb: "handover", lifecycleAction: "handover" } }));
        }
        return f.store.batch(input);
      } });
      const memo = createHistoryMemo(store), versionRecoveries: RecordReference[] = [];
      const observedMemo = { read: memo.read, drop(reference: RecordReference) { drops++; memo.drop(reference); } };
      const request = { ...h.request, copy, entry: accepted.entry };
      const refused = await createWriteBackPort({ ...h.context, store, memo: observedMemo, versionRecoveries })(request);
      expect(refused.answer).toBe("pending");
      expect(refused.entry.persisted).toEqual(accepted.entry.persisted);
      expect(submissions).toBe(1);
      expect(drops).toBe(0);
      expect(versionRecoveries).toEqual([]);
      expect(await payload()).toBe(bytes);
      expect(await h.file()).toBe(live);
      const changed = success(await f.store.read({ reference: primary.reference }));
      success(await f.store.write({ ...update(f, changed, primary.content), provenance: { verb: "handover", lifecycleAction: "handover" } }));
      const retried = await createWriteBackPort({ ...h.context, versionRecoveries })({ ...request, entry: refused.entry });
      expect(retried.answer).toBe("taken-in");
      expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
      expect(await payload()).toBe(bytes);
      expect(versionRecoveries).toEqual([]);
      const missing = await createWriteBackPort({ ...h.context, versionRecoveries })({ ...request,
        entry: { ...retried.entry, persisted: null, base: { ...h.entry.base, version: RecordVersionSchema.parse("outside-history") } } });
      expect(missing.answer).toBe("taken-in");
      expect(versionRecoveries).toEqual([h.entry.reference]);
    } finally { await h.dispose(); }
  });
}
