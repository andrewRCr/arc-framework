/** Failed placement reads preserve projected files and retry without another store mutation. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const directories: string[] = [];
const REFUSAL_TIMEOUT_MS = 60_000;
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("preserves a companion through an unreadable primary and catches up after read repair alone", async () => {
  const neighbour = ".arc/user/andrew/scratch/independent.md";
  const h = await createEngineFixture(directories, { kind: "work-item/notes",
    path: ".arc/active/current/notes-work-item-one.md", extraPaths: [neighbour] });
  const command = { checkout: h.checkout, store: h.store, ports: h.ports };
  await startProjection(command); await endProjection(command);
  const before = await h.disk(), original = await h.file();
  const independent = h.extra[0]!.record;
  success(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version,
    content: "The companion changed.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.store.write({ action: "put", reference: independent.reference, expected: independent.version,
    content: "An independent update.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const version = success(await h.store.version());
  let failed = true;
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal",
    namespace: "refs/arc/project/work-items", condition: "The primary placement cannot currently be read.",
    remedy: { text: "Repair the primary read, then retry." } });
  const store = overrideEngineStore(h.store, { read: input => failed && input.asOf === undefined && input.reference.kind === "work-item/meta"
    ? Promise.resolve({ status: "refused", refusal }) : h.store.read(input) });
  await startProjection({ ...command, store }); await endProjection({ ...command, store });
  expect(await h.file()).toBe(original);
  expect(parseStampedFile(await readFile(join(h.checkout, neighbour), "utf8")).content).toBe("An independent update.\n");
  expect((await h.disk()).state).toBe(before.state);
  expect(projectionProcessState().diagnostics.some(each => each.mark.reason === refusal.condition)).toBe(true);
  failed = false;
  await startProjection({ ...command, store }); await endProjection({ ...command, store });
  expect(parseStampedFile(await h.file()).content).toBe("The companion changed.\n");
  expect((await h.disk()).state).toBe(version);
  expect(success(await h.store.version())).toBe(version);
}, REFUSAL_TIMEOUT_MS);
