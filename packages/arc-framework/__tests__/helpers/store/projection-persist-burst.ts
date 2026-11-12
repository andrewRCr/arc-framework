/** Native interrupted replacements and target-owned evidence for saves during retirement. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createProjectionEnginePorts } from "../../../src/lib/store/projection/engine-ports.js";
import { locateProjection } from "../../../src/lib/store/projection/location.js";
import { readProjectionIndex } from "../../../src/lib/store/projection/index-file.js";
import { stageRecordFile } from "../../../src/lib/store/projection/staging.js";
import { guardReplacement } from "../../../src/lib/store/projection/replace-guard.js";
import { swapBatch } from "../../../src/lib/store/projection/swap.js";
import { createRecordRenderer } from "../../../src/lib/store/projection/record-render.js";
import { readReference } from "../../../src/lib/store/projection/change-detection.js";
import type { TakeInPort } from "../../../src/lib/store/projection/take-in-port.js";
import type { ProjectionPersistResult } from "../../../src/lib/store/projection/removal-persist.js";
import { BURST_PATH, BURST_REFERENCE, projectionSaveEvidence, preservedProjectionSave,
  type projectionBurstFixture } from "./projection-burst-fixture.js";
import { success } from "./suite-tools.js";

type Fixture = Awaited<ReturnType<typeof projectionBurstFixture>>;
export interface PersistReply { readonly persist: ProjectionPersistResult; readonly report: string; readonly observedSave: boolean }

export async function interruptBurstReplacement(f: Fixture, root: string): Promise<void> {
  const ports = createProjectionEnginePorts(root), location = await locateProjection(root, ports);
  const disk = await readProjectionIndex(location, true, { groups: "all" });
  const previous = disk.kind === "index" ? disk.index.entries[BURST_PATH] : undefined;
  if (disk.kind !== "index" || previous?.kind !== "record") throw new Error("No native record to replace");
  const record = success(await f.h.a.store.read({ reference: BURST_REFERENCE }));
  const writer = await ports.writer(), renderer = createRecordRenderer({ store: f.h.a.store });
  const staged = success(await stageRecordFile({ checkout: root, path: BURST_PATH, record,
    replacing: previous.base.blob, writer, format: "sha1", renderer }));
  const takeIn: TakeInPort = async request => ({ answer: "deferred", entry: request.entry });
  const replace = await guardReplacement({ checkout: root, path: BURST_PATH, entry: previous, staged,
    reference: await readReference(root), store: f.h.a.store, writer, format: "sha1", renderer, takeIn });
  if (replace.kind !== "replace") throw new Error("Native replacement refused");
  const stopped = new Error("Interrupted after the native aside move");
  await expect(swapBatch({ checkout: root, location, index: disk.index,
    files: [{ path: BURST_PATH, replace }], writer, format: "sha1", takeIn, readBack: false,
    hooks: { afterMove: () => Promise.reject(stopped) } })).rejects.toBe(stopped);
  const interrupted = await readProjectionIndex(location, true, { groups: "all" });
  const entry = interrupted.kind === "index" ? interrupted.index.entries[BURST_PATH] : undefined;
  if (entry?.kind !== "record" || entry.copies.length === 0) throw new Error("Native swap left no indexed copy");
  for (const copy of entry.copies) await readFile(join(root, copy.name));
}

/** A local witness counts only when its own checkout explicitly refused retirement. */
export async function assertPersistedBurstSaves(f: Fixture, entries: readonly string[], replies: readonly PersistReply[]): Promise<void> {
  await Promise.all(f.writers.map(writer => writer.close()));
  const stored = success(await f.h.a.store.read({ reference: BURST_REFERENCE })).content;
  for (const [target, reply] of replies.entries()) {
    if (reply.persist.kind === "persisted") expect(reply.observedSave,
      `Successful persist at ${f.roots[target]} must have observed its complete save before returning`).toBe(true);
  }
  for (const [editor, entry] of entries.entries()) {
    if (stored.includes(entry)) continue;
    const target = (editor + 1) % f.roots.length, root = f.roots[target]!, reply = replies[target]!;
    expect(reply.persist, `Unsent save in ${root} must refuse removal`).toMatchObject({ kind: "refused" });
    if (reply.persist.kind !== "refused") throw new Error("Unsent save permitted retirement");
    const diagnostic = `${reply.report}\n${reply.persist.remedy.text}`;
    expect(diagnostic).toMatch(/retry|recover|arc save|next save/i);
    const evidence = await projectionSaveEvidence({ roots: [root], reports: [diagnostic], stored: "" });
    const original = evidence.find(each => each.locus === join(root, BURST_PATH));
    if (original?.content.includes(entry)) {
      expect(diagnostic).toContain(BURST_PATH);
      continue;
    }
    expect(preservedProjectionSave(entry, evidence), JSON.stringify({ entry, root, reply, evidence }, null, 2)).toBe(true);
  }
}
