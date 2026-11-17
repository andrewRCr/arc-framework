/** Differently anchored siblings converge after a take-in queues the fan-out's next round. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it.each([false, true])("converges two source windows after a first-visited sibling's take-in, newer first=%s", async newerFirst => {
  const base = "intro\nline one\nseparator\nbase\nseparator two\nclosing\n";
  const { h, sibling, input, store } = await createFanOutFixture(directories, { content: base });
  await endProjection(input);
  const initial = await h.stored(), prior = base.replace("intro", "prior header");
  success(await h.store.write({ action: "put", reference: initial.reference, content: prior, expected: initial.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const checkout = join(dirname(sibling.checkout), newerFirst ? "aa-second" : "zz-second");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  const second = await seedProjection({ store: h.store, checkout, files: [{ path: h.path, reference: h.record.reference }] });
  const secondInput = { store: h.store, checkout, location: second.location, ports: () => createProjectionEnginePorts(checkout) };
  expect(await startProjection(secondInput)).toMatchObject({ kind: "ready" });
  await endProjection(secondInput);
  const edited = newerFirst ? second : sibling;
  const indexed = await readProjectionIndex(edited.location, true, { groups: "all" });
  if (indexed.kind !== "index") throw new Error("Missing editable index");
  const entry = indexed.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing editable record");
  const content = (newerFirst ? prior : base).replace("\nbase\n", "\nhand edit\n");
  await writeFile(join(edited.checkout, h.path), renderStampedFile({ content, stamp: entry.base.blob }));
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: prior.replace("closing", "verb closing"), provenance: { verb: "save", lifecycleAction: "save" } }));
  const expected = prior.replace("\nbase\n", "\nhand edit\n").replace("closing", "verb closing");
  expect((await h.stored()).content).toBe(expected);
  expect(parseStampedFile(await h.file()).content).toBe(expected);
  for (const target of [sibling, second]) {
    expect(parseStampedFile(await readFile(join(target.checkout, h.path), "utf8")).content).toBe(expected);
    expect(await readProjectionIndex(target.location, true)).toMatchObject({ kind: "index", index: { state: success(await store.version()) } });
  }
  expect(projectionProcessState().diagnostics).toEqual([]);
});
