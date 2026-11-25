/** Older history that preparation never consumes is not a freshness dependency. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture, refreshWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
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
  it(`admits the original request after an unused older history row disappears: ${backend}`, async () => {
    const native = backend === "reference" ? null : await createRefFixture(registry, backend);
    const memory = native ? null : new ReferenceBackend({ registry });
    const f: ConformanceFixture = native ?? { ...createReferenceFixture(ENTRY_CONFIGS, registry), store: memory!,
      identity: name => { if (memory) memory.environment.identity = name; } };
    const h = await createWriteBackFixture({ fixture: f, kind: "work-item/meta" });
    try {
      const oldest = success(await f.store.read({ reference: h.entry.reference }));
      success(await f.store.write(update(f, oldest, writeMetaNextAction(oldest.content, "Projected base"))));
      const refreshed = await refreshWriteBackFixture(h, h.index), entry = refreshed.entries[h.path];
      if (entry?.kind !== "record") throw new Error("The real refresh produced no base");
      const base = success(await f.store.read({ reference: entry.reference }));
      const prefix = native?.gitDir ? [`--git-dir=${native.gitDir}`] : [];
      const git = (args: string[]) => {
        if (!native) throw new Error("No native history adapter");
        return native.ports.exec("git", [...prefix, ...args], { cwd: native.root });
      };
      const ref = expandStoredPath(base.reference, { registry }).ref;
      const baseTip = native ? (await git(["rev-parse", ref])).stdout.trim() : "";
      success(await f.store.write(update(f, base, writeMetaNextAction(base.content, "Stored progress"))));
      const current = success(await f.store.read({ reference: base.reference }));
      const text = base.content + "\nA prepared historical control.\n";
      await h.edit(text, entry.base.blob);
      const request = { ...h.request, entry, base: { kind: "stamp" as const, stamp: entry.base.blob } };
      const ready = await prepareWriteBack(h.context, request);
      if (ready.kind !== "ready") throw new Error(`Historical control held: ${JSON.stringify(ready)}`);
      const prepared = success(await prepareIndexedProjectionSubmission(h.context, request, ready));
      expect(prepared.plan.prepared.historicalInputs.some(each => each.version === oldest.version)).toBe(false);
      if (memory) memory.state.events = memory.state.events.filter(event => event.version !== oldest.version);
      else if (native) {
        const tip = (await git(["rev-parse", ref])).stdout.trim();
        const rewrite = async (revision: string, parent?: string) => {
          const tree = (await git(["rev-parse", `${revision}^{tree}`])).stdout.trim();
          const message = (await git(["show", "-s", "--format=%B", revision])).stdout;
          return (await native.ports.execInput([...prefix, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit-tree", tree,
            ...parent ? ["-p", parent] : []], message, { cwd: native.root })).trim();
        };
        const rewrittenBase = await rewrite(baseTip), rewrittenCurrent = await rewrite(tip, rewrittenBase);
        await git(["update-ref", ref, rewrittenCurrent, tip]);
      }
      expect(success(await f.store.read({ reference: base.reference }))).toEqual(current);
      success(await f.store.batch(prepared.batch));
      expect(success(await f.store.read({ reference: base.reference })).content)
        .toBe(writeMetaNextAction(base.content, "Stored progress") + "\nA prepared historical control.\n");
    } finally { await h.dispose(); }
  });
}
