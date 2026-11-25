/** Explicit conflict choices bind their selected stored record independently of marker mappings. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, seed, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import { TextConflictRecordSchema } from "../../src/lib/store/conflict.js";
import type { TakeInRequest } from "../../src/lib/store/projection/take-in-port.js";
import { checkProjectionAdmission } from "../../src/lib/store/projection/admission-check.js";
import { createRecordRenderer } from "../../src/lib/store/projection/record-render.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) {
  for (const drawing of ["notice", "unshown"] as const) it(`fences a replacement conflict at the same explicit token: ${backend}/${drawing}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f, content: "base\n" });
    try {
      const base = success(await f.store.read({ reference: h.entry.reference }));
      success(await f.store.write(update(f, base, "stored\n")));
      success(await f.store.write(update(f, base, "incoming\n")));
      const conflicted = success(await f.store.read({ reference: base.reference }));
      success(await f.store.write(update(f, conflicted, "newer stored\n")));
      const current = success(await f.store.read({ reference: base.reference }));
      const only = current.conflicts[0];
      if (!only) throw new Error("Expected a real filed conflict");
      const conflict = success(await f.store.read({ reference: only }));
      const rendered = success(await createRecordRenderer({ store: f.store })({ record: current,
        content: current.content, stamped: true }));
      expect(rendered.state).toMatchObject({ markers: null, notices: [only] });
      const blob = gitBlobId(current.content, "sha1");
      await h.edit("explicitly resolved\n", blob);
      const request: TakeInRequest = { ...h.request, entry: { ...h.entry, ...rendered.state, ...(drawing === "unshown" ? { notices: [], unshown: [only] } : {}), base: { blob, version: current.version } },
        base: { kind: "stamp", stamp: blob }, resolution: { kind: "stored", reference: only } };
      expect(request.entry.markers).toBeNull();
      const ready = await prepareWriteBack(h.context, request);
      if (ready.kind !== "ready") throw new Error(JSON.stringify(ready));
      const prepared = success(await prepareIndexedProjectionSubmission(h.context, request, ready));
      await seed(f, f.reference("personal/working-memory"), "Unrelated stored prose.\n");
      expect(await checkProjectionAdmission(f.store, prepared.batch, registry, "test-user")).toBeUndefined();
      const value = TextConflictRecordSchema.parse(JSON.parse(conflict.content));
      const replacement = TextConflictRecordSchema.parse({ ...value,
        incoming: { ...value.incoming, content: value.incoming.content + " replacement" } });
      success(await f.store.write({ action: "remove", reference: only, expected: conflict.version,
        resolves: [only], provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
      success(await f.store.write({ action: "put", reference: only, expected: null, content: JSON.stringify(replacement),
        provenance: { verb: "merge", lifecycleAction: "edit" } }));
      expect(success(await f.store.read({ reference: base.reference }))).toEqual(current);
      expect(success(await f.store.read({ reference: only })).content).not.toBe(conflict.content);
      const bytes = await h.file(), version = success(await f.store.version());
      const result = await f.store.batch(prepared.batch);
      expect({ result, replacementAfter: await f.store.read({ reference: only }) }).toMatchObject({
        result: { status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } },
        replacementAfter: { status: "ok" },
      });
      expect(success(await f.store.version())).toBe(version);
      expect(await h.file()).toBe(bytes);
      const fresh = await prepareWriteBack(h.context, request);
      if (fresh.kind !== "ready") throw new Error(JSON.stringify(fresh));
      success(await f.store.batch(success(await prepareIndexedProjectionSubmission(h.context, request, fresh)).batch));
      expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ content: "explicitly resolved\n", conflicts: [] });
    } finally { await h.dispose(); }
  });
}
