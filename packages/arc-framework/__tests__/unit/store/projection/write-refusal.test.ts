/** Refused retries preserve durable copy knowledge and never resend an already-landed write. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { decideWriteBackRefusal } from "../../../../src/lib/store/projection/write-refusal.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { writeProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(h => h.dispose())); });
async function fixture() {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  await h.edit("opening\nhand edit\nclosing\n");
  return h;
}

it("retains pre-send copy marks when recovered preparation is refused, then accepts the repaired retry", async () => {
  const h = await fixture();
  const name = nameAsideFile({ path: h.path, base: h.entry.base.blob, writer: h.context.writer, role: "aside" });
  await mkdir(dirname(join(h.checkout, name)), { recursive: true });
  await writeFile(join(h.checkout, name), await h.file());
  const entry = { ...h.entry, copies: [{ name, moving: h.entry.written, linked: h.entry.written, writeBackSent: false,
    landed: null, rendering: { markers: null, notices: [] } }] };
  await writeProjectionIndex(h.location, { ...h.index, entries: { [h.path]: entry } });
  const version: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [entry.reference],
    condition: "The expected version is outside readable history.", remedy: { text: "Recover its base." } };
  const corrupt: StoreRefusal = { code: "namespace-corrupt", class: "terminal", namespace: "personal",
    condition: "The namespace needs repair.", remedy: { text: "Repair the namespace, then retry." } };
  let sent = false;
  const store = overrideEngineStore(h.store, {
    batch: async () => { sent = true; return { status: "refused", refusal: version }; },
    history: input => sent ? Promise.resolve({ status: "refused", refusal: corrupt }) : h.store.history(input),
  });
  const held = await createWriteBackPort({ ...h.context, store, memo: createHistoryMemo(store) })({ ...h.request, entry });
  expect(held).toMatchObject({ answer: "refused", entry: { copies: [{ name, writeBackSent: true }],
    refused: { reason: corrupt.condition, remedy: corrupt.remedy } } });
  expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index", index: {
    entries: { [h.path]: { copies: [{ name, writeBackSent: true }] } },
  } });
  expect(success(await h.store.read({ reference: entry.reference })).content).toBe("opening\nbase\nclosing\n");
  expect(await createWriteBackPort(h.context)({ ...h.request, entry: held.entry })).toMatchObject({ answer: "taken-in" });
  expect(success(await h.store.read({ reference: entry.reference })).content).toBe("opening\nhand edit\nclosing\n");
});

it("leaves an accepted write pending when read-back refuses instead of recovering and sending it again", async () => {
  const h = await fixture();
  let unreadable = false;
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.entry.reference],
    condition: "Read-back is temporarily unavailable.", remedy: { text: "Retry the next command." } };
  const store = overrideEngineStore(h.store, {
    batch: async input => { const result = await h.store.batch(input); unreadable = true; return result; },
    read: async input => {
      if (!unreadable) return h.store.read(input);
      unreadable = false;
      return { status: "refused", refusal };
    },
  });
  const held = await createWriteBackPort({ ...h.context, store, memo: createHistoryMemo(store) })(h.request);
  expect(held).toMatchObject({ answer: "pending", entry: { base: h.entry.base, persisted: { recording: true, takenIn: { kind: "copy" } } } });
  expect(success(await h.store.history({ reference: h.entry.reference }))).toHaveLength(2);
  expect(success(await h.store.read({ reference: h.entry.reference })).content).toBe("opening\nhand edit\nclosing\n");
  expect(h.reports).toMatchObject([{ mark: { reason: expect.stringContaining("edit landed"), remedy: refusal.remedy } }]);
  expect(await createWriteBackPort(h.context)({ ...h.request, entry: held.entry })).toMatchObject({ answer: "taken-in" });
});

it.each(["lock-held", "version-conflict", "namespace-corrupt"] as const)("retains an ambiguity hold through %s and a later stale save until a send lands", async code => {
  const h = await createCheckoutFixture({ path: ".arc/document.txt" });
  fixtures.push(h);
  await h.edit(h.incoming);
  const drawing = await writeBackFile(h.context, h.index, h.request);
  const mark = drawing.result.entry.refused;
  expect(mark?.reason).toBe("bases-disagree");
  const settled = await runSecondCheck({ ...h.context, checkout: h.checkout, index: drawing.index,
    copies: drawing.result.entry.copies.map(copy => ({ path: h.path, copy: copy.name })), takeIn: createWriteBackPort(h.context) });
  const entry = settled.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Held entry missing");
  await h.edit(h.record.content);
  const refusal: StoreRefusal = code === "namespace-corrupt"
    ? { code, class: "terminal", namespace: "personal", condition: "The namespace needs repair.", remedy: { text: "Repair the namespace." } }
    : code === "version-conflict"
      ? { code, class: "recoverable", records: [entry.reference], condition: "The expected version is outside readable history.",
        remedy: { text: "Recover its base." } }
      : { code, class: "recoverable", lock: "personal", condition: "The write lock is held.", remedy: { text: "Release the lock." } };
  if (code === "lock-held") await h.hold(entry.reference, true);
  const store = code === "lock-held" ? h.store : overrideEngineStore(h.store, { batch: async () => ({ status: "refused", refusal }) });
  const pending = await writeBackFile({ ...h.context, store }, settled.index, { ...h.request, entry });
  expect(pending.result).toMatchObject({ answer: code === "namespace-corrupt" ? "refused" : "pending",
    entry: { pending: true, refused: mark } });
  expect(await h.file()).toBe(h.record.content);
  await h.edit(h.incoming);
  const stale = await writeBackFile(h.context, pending.index, { ...h.request, entry: pending.result.entry });
  expect(stale.result).toMatchObject({ answer: "refused", entry: { refused: mark } });
  expect(await h.file()).toBe(h.incoming);
  await h.hold(entry.reference, false);
  await h.edit(h.record.content);
  const repaired = await writeBackFile(h.context, stale.index, { ...h.request, entry: stale.result.entry });
  expect(repaired.result).toMatchObject({ answer: "taken-in", entry: { refused: null } });
});


it("holds an admission conflict without spending genuine missing-base recovery", async () => {
  const h = await fixture();
  const versionRecoveries: typeof h.entry.reference[] = [];
  const context = { ...h.context, versionRecoveries, memo: createHistoryMemo(h.store) };
  const refusal = { code: "version-conflict", class: "recoverable", records: [h.entry.reference],
    cause: "projection-admission", condition: "Prepared evidence changed.", remedy: { text: "Prepare again later." } } as const;
  expect(await decideWriteBackRefusal(context, h.request, { ...refusal, records: [...refusal.records] }))
    .toEqual({ kind: "held", refusal });
  expect(versionRecoveries).toEqual([]);
  expect(success(await h.store.read({ reference: h.entry.reference })).version).toBe(h.entry.base.version);
  const missing = { ...refusal, cause: undefined };
  expect(await decideWriteBackRefusal(context, h.request, { ...missing, records: [...missing.records] }))
    .toEqual({ kind: "recover" });
  expect(versionRecoveries).toEqual([h.entry.reference]);
});
