/** A prepared single-writer merge still depends on the history that produced its accepted input. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { writeMetaNextAction } from "../../src/lib/store/kinds/meta/writers.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import type { ConformanceFixture } from "../helpers/store/fixture-contract.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) {
  it(`rechecks consumed history even when the current record and mutation basis stay unchanged: ${backend}`, async () => {
    const native = backend === "reference" ? null : await createRefFixture(registry, backend);
    const memory = native ? null : new ReferenceBackend({ registry });
    const f: ConformanceFixture = native ?? { ...createReferenceFixture(ENTRY_CONFIGS, registry), store: memory!,
      identity: name => { if (memory) memory.environment.identity = name; } };
    const h = await createWriteBackFixture({ fixture: f, kind: "work-item/meta" });
    try {
      const base = success(await f.store.read({ reference: h.entry.reference }));
      const current = success(await f.store.write(update(f, base, writeMetaNextAction(base.content, "Stored progress"))));
      const stored = success(await f.store.read({ reference: base.reference }));
      const text = base.content + "\nA prepared historical edit.\n";
      await h.edit(text);
      const bytes = await h.file();
      const prepare = async () => {
        const ready = await prepareWriteBack(h.context, h.request);
        if (ready.kind !== "ready") throw new Error(`Historical preparation held: ${JSON.stringify(ready)}`);
        return success(await prepareIndexedProjectionSubmission(h.context, h.request, ready));
      };
      const prepared = await prepare();
      expect(prepared.plan.mutation.expected).toBe(current.version);
      expect(prepared.plan.prepared.historicalInputs).toContainEqual(expect.objectContaining({ version: base.version }));
      let restore: () => Promise<void>;
      if (memory) {
        const events = memory.state.events;
        memory.state.events = events.filter(event => event.version !== base.version);
        restore = () => { memory.state.events = events; return Promise.resolve(); };
      } else if (native) {
        const prefix = native.gitDir ? [`--git-dir=${native.gitDir}`] : [];
        const git = (args: string[]) => native.ports.exec("git", [...prefix, ...args], { cwd: native.root });
        const ref = expandStoredPath(base.reference, { registry }).ref;
        const tip = (await git(["rev-parse", ref])).stdout.trim();
        const tree = (await git(["rev-parse", `${tip}^{tree}`])).stdout.trim();
        const message = (await git(["show", "-s", "--format=%B", tip])).stdout;
        const root = (await native.ports.execInput([...prefix, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
          "commit-tree", tree], message, { cwd: native.root })).trim();
        await git(["update-ref", ref, root, tip]);
        restore = async () => { await git(["update-ref", ref, tip, root]); };
      } else throw new Error("No history fixture");
      try {
        expect(success(await f.store.read({ reference: base.reference }))).toEqual(stored);
        expect(await f.store.batch(prepared.batch)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
        expect(success(await f.store.read({ reference: base.reference }))).toEqual(stored);
        expect(await h.file()).toBe(bytes);
      } finally { await restore(); }
      success(await f.store.batch((await prepare()).batch));
      expect(success(await f.store.read({ reference: base.reference })).content)
        .toBe(writeMetaNextAction(base.content, "Stored progress") + "\nA prepared historical edit.\n");
    } finally { await h.dispose(); }
  });
}
