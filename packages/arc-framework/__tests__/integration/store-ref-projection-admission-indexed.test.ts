/** Indexed decisions retain strict evidence while allowing unrelated state to move. */
import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { success, seed, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";
import { createHistoryMemo } from "../../src/lib/store/projection/base-recovery.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaOwner } from "../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createStagedFile, nameAsideFile } from "../../src/lib/store/projection/aside.js";
import type { TakeInRequest } from "../../src/lib/store/projection/take-in-port.js";
import { randomUUID } from "node:crypto";
import { RecordReferenceSchema, RecordVersionSchema, type RecordReference } from "../../src/lib/store/identity.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
const cases = ["subject-change", "subject-removal", "conflict-only", "owner", "aside-owner", "unrelated"] as const;
for (const backend of ["reference", "default", "separate"] as const) for (const change of cases) {
  it(`refuses changed prepared evidence and accepts fresh preparation: ${backend}/${change}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const owned = change === "owner" || change === "aside-owner";
    const baseText = "opening\nseparation one\nbase\nseparation two\nclosing\n";
    const h = await createWriteBackFixture({ fixture: f, kind: owned ? "work-item/notes" : "personal/document", content: baseText });
    try {
      const original = success(await f.store.read({ reference: h.entry.reference }));
      const currentConflictVersion = change === "conflict-only" ? success(await f.store.write(update(f, original,
        baseText.replace("opening", "remote opening")))).version : null;
      const text = baseText.replace("base", "authored edit");
      await h.edit(text);
      let request: TakeInRequest = h.request;
      if (change === "aside-owner") {
        const copy = nameAsideFile({ path: h.path, base: h.entry.base.blob, writer: h.context.writer, role: "aside" });
        await createStagedFile(h.checkout, copy, await h.file());
        await writeFile(join(h.checkout, h.path), "independent live bytes\n");
        request = { ...request, copy };
      }
      const bytes = await h.file();
      const primary = owned ? success(await f.store.read({ reference: recordReferences["work-item/meta"](h.entry.reference.owner) })) : null;
      const control = change === "unrelated" ? await seed(f, f.reference("personal/document", "control"), "control\n") : null;
      let intercepted = false;
      const store = overrideEngineStore(f.store, { batch: async input => {
        if (!intercepted && input.projectionAdmission) {
          intercepted = true;
          if (primary) success(await f.store.write({ ...update(f, primary, writeMetaOwner(primary.content, SlugSchema.parse("another-user"))),
            provenance: { verb: "handover", lifecycleAction: "handover" } }));
          else if (change === "subject-removal") success(await f.store.write({ action: "remove", reference: h.entry.reference,
            expected: h.entry.base.version, provenance: { verb: "edit", lifecycleAction: "edit" } }));
          else if (change === "conflict-only") {
            if (backend === "reference") {
              const label = { actor: "concurrent", time: "2026-11-01T00:00:00Z" };
              success(await f.store.write({ action: "put", expected: null,
                reference: RecordReferenceSchema.parse({ kind: "personal/conflict-record", owner: h.entry.reference.owner, key: randomUUID() }),
                content: JSON.stringify({ record: h.entry.reference, location: { kind: "hunk", start: 0, end: 1 },
                  base: "opening\n", baseVersion: original.version, current: { content: "remote opening\n", label },
                  incoming: { content: "other opening\n", label }, currentLines: 1, incomingLines: 1 }),
                provenance: { verb: "merge", lifecycleAction: "edit" } }));
            } else success(await f.store.write(update(f, original, baseText.replace("opening", "other opening"))));
            const disputed = success(await f.store.read({ reference: h.entry.reference }));
            expect(disputed.version).toBe(currentConflictVersion);
            expect(disputed.conflicts).toHaveLength(1);
          } else if (control) success(await f.store.write(update(f, control, "changed control\n")));
          else success(await f.store.write({ action: "put", reference: h.entry.reference, expected: h.entry.base.version,
            content: baseText.replace("opening", "remote opening"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
        }
        return f.store.batch(input);
      } });
      const versionRecoveries: RecordReference[] = [];
      const first = await createWriteBackPort({ ...h.context, store, memo: createHistoryMemo(store), versionRecoveries })(request);
      expect(intercepted).toBe(true);
      if (change === "unrelated") {
        expect(first.answer).toBe("taken-in");
        expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
        return;
      }
      expect(first.answer).toBe(change === "subject-removal" && backend !== "reference" ? "refused" : "pending");
      expect(first.entry.persisted).toBeNull();
      if (change !== "subject-removal" || backend === "reference") expect(versionRecoveries).toEqual([]);
      expect(await h.file()).toBe(bytes);
      if (primary) {
        const current = success(await f.store.read({ reference: primary.reference }));
        success(await f.store.write({ ...update(f, current, primary.content), provenance: { verb: "handover", lifecycleAction: "handover" } }));
      } else if (change === "subject-removal") success(await f.store.write({ action: "put", reference: h.entry.reference, expected: null,
        content: baseText, provenance: { verb: "seed", lifecycleAction: "seed" } }));
      else if (change === "conflict-only") {
        const current = success(await f.store.read({ reference: h.entry.reference }));
        success(await f.store.write({ ...update(f, current, baseText), resolves: current.conflicts,
          provenance: { verb: "resolve", lifecycleAction: "edit" } }));
      }
      const entry = owned ? { ...first.entry, base: { ...first.entry.base, version: RecordVersionSchema.parse("outside-history") } } : first.entry;
      const retry = await createWriteBackPort({ ...h.context, versionRecoveries })({ ...request, entry });
      expect(retry.answer).toBe("taken-in");
      if (owned) expect(versionRecoveries).toEqual([h.entry.reference]);
      expect(success(await f.store.read({ reference: h.entry.reference })).content)
        .toBe(change === "subject-change" ? text.replace("opening", "remote opening") : text);
      expect(await h.file()).toBe(bytes);
    } finally { await h.dispose(); }
  });
}
