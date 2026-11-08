/** Fresh inventory selection detects arriving archived candidates without observing unused rows. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareAdoptedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import type { ConformanceFixture } from "../helpers/store/fixture-contract.js";
import type { RecordReference } from "../../src/lib/store/identity.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
const placement = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } as const;

async function archivedErrand(f: ConformanceFixture, reference: RecordReference) {
  const content = JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
    slug: reference.owner.name, claimId: "a".repeat(32), owner: "test-user", state: "open", branch: `chore/${reference.owner.name}`,
    createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", intent: "A bounded correction",
    origin: "description", originEntry: null, savedHead: null, changeRequest: null }));
  const result = success(await f.store.write({ action: "put", reference, content, expected: null, placement,
    provenance: { verb: "errand-open", lifecycleAction: "create" } }));
  return success(await f.store.read({ reference: result.reference }));
}

for (const backend of ["reference", "default", "separate"] as const) for (const arrival of ["qualifying", "unused"] as const) {
  it(`repeats archived Errand uniqueness at admission: ${backend}/${arrival}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f });
    try {
      const primary = await archivedErrand(f, f.reference("work-item/record"));
      const path = resolveArcPath({ kind: "errand-description", slug: primary.reference.owner.name, placement });
      const content = "## Description\n\n### [ ] **Retained concern**\n\nA correction.\n";
      const prepare = () => prepareAdoptedProjectionSubmission(h.context, h.checkout, path,
        { content, stamp: null, mtimeNs: "0" }, h.index);
      const prepared = success(await prepare());
      const before = success(await f.store.read({ reference: primary.reference }));
      const competing = await archivedErrand(f, f.reference("work-item/record", arrival === "qualifying" ? "one" : "unused"));
      expect(success(await f.store.read({ reference: primary.reference }))).toEqual(before);
      const result = await f.store.batch(prepared.batch);
      const target = prepared.plan.prepared.reference;
      if (arrival === "qualifying") {
        expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
        expect(await f.store.read({ reference: target })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
        success(await f.store.write({ action: "remove", reference: competing.reference, expected: competing.version,
          provenance: { verb: "abandon", lifecycleAction: "remove" } }));
        const fresh = success(await prepare());
        success(await f.store.batch(fresh.batch));
      } else expect(result.status).toBe("ok");
      expect(success(await f.store.read({ reference: target })).content).toContain("A correction.");
    } finally { await h.dispose(); }
  });
}
