/** Round-level reads and command-level conflict history remain shared across destination worktrees. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { configureEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it("shares the primary re-lay's owner listing, view selection, and record reads for the whole round", async () => {
  let observed: ReturnType<typeof createRefusingStore> | undefined;
  const readTrace: unknown[] = [];
  const h = await createFanOutFixture(directories, { workItem: true,
    store: store => {
      const counted = createRefusingStore(store); observed = counted;
      return overrideEngineStore(counted.store, {
        read: async input => { readTrace.push(input); return counted.store.read(input); },
      });
    } });
  if (observed === undefined) throw new Error("Missing source counter");
  const primary = success(await h.h.store.read({ reference: recordReferences["work-item/meta"](h.h.record.reference.owner) }));
  const before = { version: observed.calls("version"), changes: observed.calls("changes"), list: observed.calls("list"), read: observed.calls("read") };
  readTrace.length = 0;
  success(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, placement: { kind: "active" },
    content: primary.content + "\nA metadata correction.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  for (const [checkout, path] of [[h.h.checkout, ".arc/active/current/meta-work-item-one.md"],
    [h.sibling.checkout, ".arc/active/in-flight/work-item-one/meta-work-item-one.md"]] as const) {
    expect(await readFile(join(checkout, path), "utf8")).toContain("A metadata correction.");
  }
  expect(observed.calls("version") - before.version).toBe(1);
  expect(observed.calls("changes") - before.changes).toBe(1);
  expect(observed.calls("list") - before.list).toBe(3);
  expect(observed.calls("read") - before.read).toBe(3);
  expect(readTrace).toHaveLength(3);
  expect(new Set(readTrace.map(query => JSON.stringify(query))).size).toBe(readTrace.length);
});

it.each([false, true])("shares conflict history across two siblings and invalidates it after a take-in=%s", async takeIn => {
  let observed: ReturnType<typeof createRefusingStore> | undefined;
  const base = "intro\nline one\nseparator\nbase\nseparator two\nclosing\n";
  const h = await createFanOutFixture(directories, { content: base,
    store: store => {
      const counted = createRefusingStore(store); observed = counted;
      return counted.store;
    } });
  if (observed === undefined) throw new Error("Missing source counter");
  await endProjection(h.input);
  const checkout = join(dirname(h.sibling.checkout), "zz-second");
  await h.h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.h.checkout });
  await configureEngineCheckout(checkout);
  const second = await seedProjection({ store: h.h.store, checkout, files: [{ path: h.h.path, reference: h.h.record.reference }] });
  const secondInput = { store: h.h.store, checkout, location: second.location };
  expect(await startProjection(secondInput)).toMatchObject({ kind: "ready" });
  await endProjection(secondInput);
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  const initial = await h.h.stored(), histories = observed.calls("history");
  for (const content of [base.replace("\nbase\n", "\nleft stored\n"), base.replace("\nbase\n", "\nright stored\n")]) {
    success(await h.h.store.write({ action: "put", reference: initial.reference, expected: initial.version, content,
      provenance: { verb: "save", lifecycleAction: "save" } }));
  }
  expect((await h.h.stored()).conflicts).toHaveLength(1);
  if (takeIn) {
    const entry = (await h.disk()).entries[h.h.path];
    if (entry?.kind !== "record") throw new Error("Missing editor base");
    await writeFile(join(h.sibling.checkout, h.h.path), renderStampedFile({ content: base.replace("intro", "hand intro"), stamp: entry.base.blob }));
  }
  success(await h.store.push());
  const rendered = await h.h.file();
  expect(rendered).toContain("<<<<<<<");
  expect(await h.file()).toBe(rendered);
  expect(await readFile(join(second.checkout, h.h.path), "utf8")).toBe(rendered);
  if (takeIn) expect((await h.h.stored()).content).toContain("hand intro");
  expect(observed.calls("history") - histories).toBe(takeIn ? 2 : 1);
});
