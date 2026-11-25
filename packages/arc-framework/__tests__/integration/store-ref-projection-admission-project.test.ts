/** Project-file preparation retains the identity that supplied its namespace. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareAdoptedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) {
  it(`holds a prepared project file while its identity is conflicted and continues after repair: ${backend}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f });
    try {
      const reference = f.reference("project-registry/identity");
      const content = JSON.stringify({ projectId: randomUUID() });
      const created = success(await f.store.write({ action: "put", reference, expected: null, content,
        provenance: { verb: "init", lifecycleAction: "create" } }));
      const identity = success(await f.store.read({ reference: created.reference }));
      const path = resolveArcPath({ kind: "inbox", scope: { kind: "project" } });
      const authored = "# Atomic Inbox\n\n## Errand\n\n";
      const prepare = () => prepareAdoptedProjectionSubmission(h.context, h.checkout, path,
        { content: authored, stamp: null, mtimeNs: "0" }, h.index);
      const prepared = success(await prepare());
      const label = { actor: "competing", time: "2026-11-01T00:00:00Z" };
      const disputed = success(await f.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "project-registry/conflict-record", owner: identity.reference.owner, key: randomUUID() }),
        content: canonicalize({ record: identity.reference, location: { kind: "hunk", start: 0, end: 1 }, base: content,
          baseVersion: identity.version, current: { content, label }, incoming: { content: JSON.stringify({ projectId: randomUUID() }), label },
          currentLines: 1, incomingLines: 1 }), provenance: { verb: "merge", lifecycleAction: "edit" } }));
      expect(success(await f.store.read({ reference: identity.reference }))).toMatchObject({ version: identity.version, conflicts: [disputed.reference] });
      const version = success(await f.store.version());
      expect(await f.store.batch(prepared.batch)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
      expect(success(await f.store.version())).toBe(version);
      if (!disputed.version) throw new Error("The conflict has no stored version");
      success(await f.store.write({ action: "remove", reference: disputed.reference, expected: disputed.version, resolves: [disputed.reference],
        provenance: { verb: "resolve", lifecycleAction: "edit" } }));
      const fresh = success(await prepare());
      success(await f.store.batch(fresh.batch));
      expect(success(await f.store.read({ reference: fresh.plan.prepared.reference })).content).toBe(authored);
    } finally { await h.dispose(); }
  });
}
