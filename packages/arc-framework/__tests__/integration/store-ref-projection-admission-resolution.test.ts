/** A prepared explicit resolution cannot consume conflict evidence changed before admission. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import type { TakeInRequest } from "../../src/lib/store/projection/take-in-port.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) {
  it(`holds changed resolution evidence and permits a fresh explicit choice: ${backend}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const h = await createWriteBackFixture({ fixture: f, content: "base\n" });
    try {
      const base = success(await f.store.read({ reference: h.entry.reference }));
      const conflict = async (text: string) => {
        success(await f.store.write(update(f, base, text)));
        const current = success(await f.store.read({ reference: base.reference }));
        const only = current.conflicts[0];
        if (!only) throw new Error("A concurrent choice must produce a real conflict");
        return { current, only };
      };
      success(await f.store.write(update(f, base, "stored\n")));
      const initial = await conflict("incoming\n");
      const text = "explicitly resolved\n";
      await h.edit(text, gitBlobId(initial.current.content, "sha1"));
      const prepare = async (choice: typeof initial) => {
        const blob = gitBlobId(choice.current.content, "sha1");
        const request: TakeInRequest = { ...h.request, entry: { ...h.entry, base: { blob, version: choice.current.version } },
          base: { kind: "stamp", stamp: blob }, resolution: { kind: "stored", reference: choice.only } };
        const ready = await prepareWriteBack(h.context, request);
        if (ready.kind !== "ready") throw new Error(`Explicit choice held: ${JSON.stringify(ready)}`);
        return success(await prepareIndexedProjectionSubmission(h.context, request, ready));
      };
      const prepared = await prepare(initial), bytes = await h.file();
      success(await f.store.write({ ...update(f, initial.current, initial.current.content), resolves: [initial.only] }));
      const intervening = success(await f.store.read({ reference: base.reference }));
      const version = success(await f.store.version());
      expect(await f.store.batch(prepared.batch)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
      expect(success(await f.store.version())).toBe(version);
      expect(success(await f.store.read({ reference: base.reference }))).toEqual(intervening);
      expect(await h.file()).toBe(bytes);
      const fresh = await conflict("new competing choice\n");
      success(await f.store.batch((await prepare(fresh)).batch));
      expect(success(await f.store.read({ reference: base.reference }))).toMatchObject({ content: text, conflicts: [] });
    } finally { await h.dispose(); }
  });
}
