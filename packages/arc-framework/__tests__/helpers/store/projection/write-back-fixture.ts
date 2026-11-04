/** A file-backed projection over the memory store, without a Git process. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createReferenceFixture } from "../reference-fixture.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import type { KindId } from "../../../../src/lib/store/catalog.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import type { WriteBackDiagnostic } from "../../../../src/lib/store/projection/write-back.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { swapBatch, type SwapHooks } from "../../../../src/lib/store/projection/swap.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";

/** Seed a store record and its projected copy; callers dispose of the checkout when finished. */
export async function createWriteBackFixture(input: { kind?: KindId; path?: string; content?: string } = {}) {
  const checkout = await mkdtemp(join(tmpdir(), "arc-read-back-"));
  const gitDir = join(checkout, ".git");
  const location: ProjectionLocation = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir, { recursive: true });
  const fixture = createReferenceFixture(ENTRY_CONFIGS);
  const reference = fixture.reference(input.kind ?? "personal/document");
  if (reference.owner.type === "work-item") {
    const primary = fixture.reference("work-item/record");
    const result = await fixture.store.write({ action: "put", reference: primary, expected: null,
      content: fixture.content(primary), placement: { kind: "active" }, provenance: { verb: "errand-open", lifecycleAction: "create" } });
    if (result.status !== "ok") throw new Error("primary seed refused");
  }
  const seeded = await fixture.store.write({ action: "put", reference, expected: null,
    content: input.content ?? "opening\nbase\nclosing\n", provenance: { verb: "seed", lifecycleAction: "seed" } });
  if (seeded.status !== "ok") throw new Error(`seed refused: ${seeded.refusal.condition}`);
  const read = await fixture.store.read({ reference: seeded.result.reference });
  if (read.status !== "ok") throw new Error("seed read refused");
  const path = input.path ?? ".arc/personal-document.md";
  const blob = gitBlobId(read.result.content, "sha1");
  const rendered = (content: string, stamp = blob) => path.endsWith(".md") ? renderStampedFile({ content, stamp }) : content;
  await mkdir(dirname(join(checkout, path)), { recursive: true });
  await writeFile(join(checkout, path), rendered(read.result.content));
  const entry: RecordEntry = { kind: "record", reference: read.result.reference,
    stat: await readStat(join(checkout, path)), written: gitBlobId(rendered(read.result.content), "sha1"),
    base: { blob, version: read.result.version }, markers: null, notices: [], unshown: [], protected: false,
    changed: false, pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] };
  const index: ProjectionIndex = await commitProjectionIndex({ location, checkout, installing: new Set([path]), index: {
    format: 1, state: null, projectedUnder: { view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("test-user"), claim: null, layoutActive: "nested" },
    withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreGuard: null, entries: { [path]: entry },
  } });
  const reports: WriteBackDiagnostic[] = [];
  const context = { store: fixture.store, location, format: "sha1" as const, memo: createHistoryMemo(fixture.store),
    writer: { pid: process.pid, processInstance: "read-back-test", processScope: "unit" },
    report: (diagnostic: WriteBackDiagnostic) => { reports.push(diagnostic); } };
  const request = { checkout, path, copy: null, entry, base: path.endsWith(".md")
    ? { kind: "stamp" as const, stamp: blob } : { kind: "blob" as const, blob } };
  return { ...fixture, checkout, location, path, entry, index, context, request, reports,
    edit: (content: string, stamp?: string) => writeFile(join(checkout, path), rendered(content, stamp)),
    file: () => readFile(join(checkout, path), "utf8"),
    dispose: () => rm(checkout, { recursive: true, force: true }),
  };
}

/** Refresh a seeded file through the production guard and swap, then settle the command's copies. */
export async function refreshWriteBackFixture(
  source: Pick<Awaited<ReturnType<typeof createWriteBackFixture>>, "checkout" | "context" | "path">,
  index: ProjectionIndex,
  hooks?: SwapHooks,
): Promise<ProjectionIndex> {
  const { context, checkout, path } = source;
  const entry = index.entries[path];
  if (entry?.kind !== "record") throw new Error("refresh entry unavailable");
  const read = await context.store.read({ reference: entry.reference });
  if (read.status !== "ok") throw new Error("refresh read refused");
  const staged = await stageRecordFile({ ...context, checkout, path, record: read.result, replacing: entry.base.blob });
  const takeIn = createWriteBackPort(context);
  const guarded = await guardReplacement({ ...context, checkout, path, entry, staged,
    reference: await readReference(checkout), takeIn });
  if (guarded.kind !== "replace") throw new Error("refresh was not admitted");
  const swapped = await swapBatch({ ...context, checkout, index, files: [{ path, replace: guarded }], readBack: false, takeIn, hooks });
  return (await runSecondCheck({ ...context, checkout, index: swapped.index, copies: swapped.copies, takeIn })).index;
}
