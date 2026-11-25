/** Handled post-acceptance failures preserve the input basis across changed retries. */
import { afterEach, expect, it } from "vitest";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { nameAsideFile, createStagedFile } from "../../../../src/lib/store/projection/aside.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { createHistoryMemo, recoverBase } from "../../../../src/lib/store/projection/base-recovery.js";
import { createWriteBackPort, prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { readRetainedBase, selectPersistedBase } from "../../../../src/lib/store/projection/taken-in.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { selectStamplessBase } from "../../../../src/lib/store/projection/stampless-base.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(h => h.dispose())); });

it.each([false, true])("preserves a newer revert after refused read-back with prior mapping %s", async prior => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  let index = h.index, entry = h.entry;
  if (prior) {
    await h.edit("opening\nprior edit\nclosing\n");
    const previous = await writeBackFile(h.context, index, h.request);
    index = previous.index; entry = previous.result.entry;
  }
  await h.edit("opening\naccepted edit\nclosing\n");
  let unavailable = false;
  const refusal: StoreRefusal = { code: "state-unresolvable", class: "recoverable", reference: entry.reference,
    historyRefs: [], condition: "Read-back unavailable.", remedy: { text: "Repair the read and retry." } };
  const store = overrideEngineStore(h.store, {
    batch: async input => { const result = await h.store.batch(input); unavailable = true; return result; },
    read: input => unavailable ? Promise.resolve({ status: "refused", refusal }) : h.store.read(input),
  });
  const context = { ...h.context, store, memo: createHistoryMemo(store) };
  const first = await writeBackFile(context, index, { ...h.request, entry });
  expect(first.result.answer).toBe("pending");
  expect(first.result.entry.persisted).toMatchObject({ recording: true, takenIn: { kind: "copy" } });
  await writeProjectionIndex(h.location, first.index);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Pending index missing");
  const persisted = disk.index.entries[h.path];
  if (persisted?.kind !== "record") throw new Error("Pending mapping missing");
  expect(await prepareWriteBack(h.context, { ...h.request, entry: persisted })).toMatchObject({ kind: "held" });
  unavailable = false;
  await h.edit("opening\nbase\nclosing\n");
  const retry = await writeBackFile(h.context, disk.index, { ...h.request, entry: persisted });
  expect(retry.result.answer).toBe("taken-in");
  expect(success(await h.store.read({ reference: entry.reference })).content).toBe("opening\nbase\nclosing\n");
  expect(await h.file()).toContain("opening\nbase\nclosing\n");
});

it.each(["immediate", "history", "read-back"])("uses the accepted entry version after a later removal with %s recovery", async mode => {
  const base = "# Inbox\n\n## Errand\n\n### [ ] **Existing**\n\n- _Id:_ `11111111`\n\nbase\n";
  const incoming = base + "\n### [ ] **New task**\n\nnew body\n";
  const h = await createWriteBackFixture({ kind: "personal/inbox", content: base });
  fixtures.push(h);
  await h.edit(incoming);
  let writes = 0, blocked = mode === "history", unreadable = mode === "read-back", landed = "";
  const refusal: StoreRefusal = { code: "state-unresolvable", class: "recoverable", reference: h.entry.reference,
    historyRefs: [], condition: "Accepted history unavailable.", remedy: { text: "Restore history and retry." } };
  const store = overrideEngineStore(h.store, {
    batch: async input => {
      writes++;
      const result = await h.store.batch(input);
      const accepted = result.status === "ok" ? result.result.writes[0] : undefined;
      if (accepted?.version !== undefined && writes === 1) {
        landed = success(await h.store.read({ reference: h.entry.reference })).content;
        success(await h.store.write({ action: "put", reference: h.entry.reference, expected: accepted.version,
          content: base, provenance: { verb: "edit", lifecycleAction: "edit" } }));
      }
      return result;
    },
    read: input => {
      if (writes === 1 && unreadable) { unreadable = false; return Promise.resolve({ status: "refused" as const, refusal }); }
      return h.store.read(input);
    },
    history: input => blocked ? Promise.resolve({ status: "refused", refusal }) : h.store.history(input),
  });
  const context = { ...h.context, store, memo: createHistoryMemo(store) };
  let result = await createWriteBackPort(context)(h.request);
  if (mode !== "immediate") {
    expect(result.answer).toBe("pending");
    expect(result.entry.persisted).toMatchObject({ recording: true });
    if (blocked) {
      result = await createWriteBackPort(context)({ ...h.request, entry: result.entry });
      expect(result.answer).toBe("pending");
      expect(writes).toBe(1);
    }
    blocked = false;
    result = await createWriteBackPort(context)({ ...h.request, entry: result.entry });
  }
  const mapping = result.entry.persisted;
  if (mapping?.takenIn.kind !== "copy") throw new Error("Expected retained accepted input");
  const kept = await readRetainedBase(h.location, mapping.takenIn.name);
  expect(kept).toBe(landed);
  expect(kept.match(/_Id:_/gu)).toHaveLength(2);
  expect(mapping.recording).toBeUndefined();
});

it("keeps a missing ordinary retained copy pending without a second write, then continues after repair", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  await h.edit("opening\naccepted edit\nclosing\n");
  let unavailable = false;
  const refusal: StoreRefusal = { code: "state-unresolvable", class: "recoverable", reference: h.entry.reference,
    historyRefs: [], condition: "Read-back unavailable.", remedy: { text: "Repair the read." } };
  const store = overrideEngineStore(h.store, {
    batch: async input => { const result = await h.store.batch(input); unavailable = true; return result; },
    read: input => unavailable ? Promise.resolve({ status: "refused", refusal }) : h.store.read(input),
  });
  const first = await writeBackFile({ ...h.context, store }, h.index, h.request);
  const mapping = first.result.entry.persisted;
  if (mapping?.takenIn.kind !== "copy") throw new Error("Accepted copy missing");
  const copy = join(h.location.stateDir, TAKEN_IN_FOLDER, mapping.takenIn.name), backup = `${copy}-saved`;
  await rename(copy, backup);
  const version = success(await h.store.version());
  const refused = { status: "refused", refusal: { code: "state-unresolvable" } };
  expect(await selectPersistedBase({ location: h.location, entry: first.result.entry, stamp: h.entry.base.blob })).toMatchObject(refused);
  expect(await recoverBase({ content: "opening\nbase\nclosing\n", entry: first.result.entry, format: "sha1", memo: h.context.memo,
    readCopy: async () => { throw new Error("An unfinished copy must not be consumed"); } })).toMatchObject(refused);
  expect(await selectStamplessBase(h.context, { ...h.request, entry: first.result.entry,
    base: { kind: "blob", blob: h.entry.base.blob } }, "opening\nbase\nclosing\n")).toMatchObject(refused);
  await h.edit("opening\nbase\nclosing\n");
  const held = await writeBackFile(h.context, first.index, { ...h.request, entry: first.result.entry });
  expect(held.result).toMatchObject({ answer: "pending", entry: { persisted: mapping } });
  expect(success(await h.store.version())).toBe(version);
  expect(await h.file()).toContain("opening\nbase\nclosing\n");
  await rename(backup, copy);
  const repaired = await writeBackFile(h.context, held.index, { ...h.request, entry: held.result.entry });
  expect(repaired.result.answer).toBe("taken-in");
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe("opening\nbase\nclosing\n");
});

it("finishes an aside input mapping without installing its read as the live-file baseline", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  await h.edit("opening\naccepted aside edit\nclosing\n");
  const copy = nameAsideFile({ path: h.path, base: h.entry.base.blob, writer: h.context.writer, role: "aside" });
  await createStagedFile(h.checkout, copy, await h.file());
  await h.edit("opening\nindependent live edit\nclosing\n");
  const live = await h.file();
  let unavailable = false;
  const refusal: StoreRefusal = { code: "state-unresolvable", class: "recoverable", reference: h.entry.reference,
    historyRefs: [], condition: "Aside read-back unavailable.", remedy: { text: "Repair the read." } };
  const store = overrideEngineStore(h.store, {
    batch: async input => { const result = await h.store.batch(input); unavailable = true; return result; },
    read: input => unavailable ? Promise.resolve({ status: "refused", refusal }) : h.store.read(input),
  });
  const request = { ...h.request, copy, rendering: { markers: null, notices: [] } };
  const first = await createWriteBackPort({ ...h.context, store })(request);
  expect(first).toMatchObject({ answer: "pending", entry: { persisted: { recording: true } } });
  expect(first.entry.adoption).toBeUndefined();
  await writeFile(join(h.checkout, copy), (await readFile(join(h.checkout, copy), "utf8")).replace("accepted aside edit", "base"));
  const repaired = await createWriteBackPort(h.context)({ ...request, entry: first.entry });
  expect(repaired.answer).toBe("taken-in");
  expect(await h.file()).toBe(live);
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe("opening\nbase\nclosing\n");
});
