/** Indexed capsules retain their exact UID while their path must name the same semantic artifact. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { createWriteBackPort } from "../../src/lib/store/projection/write-back.js";
import { createStagedFile, nameAsideFile } from "../../src/lib/store/projection/aside.js";
import { RecordReferenceSchema, recordReferences } from "../../src/lib/store/identity.js";
import { success, update } from "../helpers/store/suite-tools.js";
import { isManagedPath, SlugSchema } from "../../src/lib/kernel/index.js";
import { writeProjectionIndex } from "../../src/lib/store/projection/index-file.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) for (const source of ["file", "aside"] as const) {
  for (const variant of ["kind", "key", "unclassified", "rename", "renamed-claim"] as const) {
    it(`binds semantic addresses and admits repaired or renamed requests: ${backend}/${source}/${variant}`, async () => {
      const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
      const kind = variant === "key" ? "work-item/companion" : "work-item/notes";
      const name = f.reference(kind).owner.name;
      const path = `.arc/active/current/${variant === "key" ? "one" : "notes"}-${name}.md`;
      const h = await createWriteBackFixture({ fixture: f, kind, path, content: "existing notes\n" });
      try {
        const renamed = variant === "rename" || variant === "renamed-claim";
        if (renamed) {
          const primary = success(await f.store.read({ reference: recordReferences["work-item/meta"](h.entry.reference.owner) }));
          success(await f.store.write({ ...update(f, primary, primary.content),
            reference: RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "renamed" } }) }));
          if (variant === "renamed-claim") await writeProjectionIndex(h.location, { ...h.index,
            projectedUnder: { ...h.index.projectedUnder, claim: SlugSchema.parse("renamed") } });
        }
        await h.edit("authored notes\n");
        const copy = source === "aside" ? nameAsideFile({ path, base: h.entry.base.blob, writer: h.context.writer, role: "aside" }) : null;
        if (copy !== null) await createStagedFile(h.checkout, copy, await h.file());
        let intercepted = false;
        const store = overrideEngineStore(f.store, { batch: async input => {
          if (!input.projectionAdmission) return f.store.batch(input);
          intercepted = true;
          if (!renamed) {
            const altered = structuredClone(input);
            if (!altered.projectionAdmission) throw new Error("Prepared request missing");
            const alteredPath = variant === "unclassified" ? ".arc/unmapped.md"
              : `.arc/active/current/${variant === "key" ? "two" : "tasks"}-${name}.md`;
            if (!isManagedPath(alteredPath)) throw new Error("Expected a managed test path");
            altered.projectionAdmission.local.path = alteredPath;
            const before = success(await f.store.version());
            expect(await f.store.batch(altered)).toMatchObject({ status: "refused", refusal: {
              code: "record-malformed", rule: "projection.admission", remedy: { text: expect.any(String) },
            } });
            expect(success(await f.store.version())).toBe(before);
            expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe("existing notes\n");
          }
          return f.store.batch(input);
        } });
        const result = await createWriteBackPort({ ...h.context, store })({ ...h.request, copy });
        expect(intercepted).toBe(true);
        expect(result.answer).toBe("taken-in");
        expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe("authored notes\n");
        expect(await h.file()).toContain("authored notes\n");
      } finally { await h.dispose(); }
    });
  }
}
