/** A file-backed projection over the memory store, without a Git process. */
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createReferenceFixture } from "../reference-fixture.js";
import type { ConformanceFixture } from "../fixture-contract.js";
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
import { makeMetaFixture } from "../../meta-fixture.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../bound-checkout.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { type RecordReference, RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { companionStoredName } from "../../../../src/lib/store/companion-name.js";

/** Seed a store record and its projected copy; callers dispose of the checkout when finished. */
export async function createWriteBackFixture(input: { kind?: KindId; path?: string; content?: string; fixture?: ConformanceFixture; identity?: string } = {}) {
  const checkout = await mkdtemp(join(tmpdir(), "arc-read-back-"));
  const gitDir = join(checkout, ".git");
  const location: ProjectionLocation = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir, { recursive: true });
  const needsMeta = input.kind?.startsWith("work-item/") && input.kind !== "work-item/description";
  const fixture = input.fixture ?? createReferenceFixture(ENTRY_CONFIGS, needsMeta ? { "work-item/meta": { parser: META_REGISTRATION.parser } } : {});
  const selected = fixture.reference(input.kind ?? "personal/document");
  const identity = SlugSchema.parse(input.identity ?? "test-user");
  const suppliedKey = input.path && !input.path.endsWith(".md") ? basename(input.path) : null;
  const scratchPrefix = `.arc/user/${identity}/`;
  const scratchKey = selected.kind === "personal/document" && input.path?.startsWith(`${scratchPrefix}scratch/`)
    ? input.path.slice(scratchPrefix.length) : suppliedKey ? `scratch/${suppliedKey}` : null;
  const reference = RecordReferenceSchema.parse({ ...selected,
    ...(selected.owner.type === "person" ? { owner: { ...selected.owner, name: identity } } : {}),
    ...(scratchKey && selected.kind === "personal/document" ? { key: scratchKey } : {}),
    ...(suppliedKey && selected.kind === "work-item/companion" ? { key: suppliedKey } : {}) });
  fixture.identity(identity);
  const meta = makeMetaFixture(reference.owner.name, { owner: identity, state: "Active", workClass: "Light",
    priority: "P1", currentWorkflow: "process-task-loop" });
  let primaryRecord: Pick<StoreRecord, "reference"> | null = null;
  if (reference.owner.type === "work-item" && reference.kind !== "work-item/meta") {
    const errand = reference.kind === "work-item/description";
    const primary = fixture.reference(errand ? "work-item/record" : "work-item/meta");
    const content = errand ? JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
      slug: primary.owner.name, claimId: "a".repeat(32), owner: identity, state: "open", branch: `chore/${primary.owner.name}`,
      createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", intent: "A bounded correction",
      origin: "description", originEntry: null, savedHead: null, changeRequest: null })) : meta;
    const result = await fixture.store.write({ action: "put", reference: primary, expected: null,
      content, placement: { kind: "active" }, provenance: { verb: "seed", lifecycleAction: "seed" } });
    if (result.status !== "ok") throw new Error(`primary seed refused: ${result.refusal.condition}`);
    primaryRecord = result.result;
  }
  const seeded = await fixture.store.write({ action: "put", reference, expected: null,
    ...(reference.kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}),
    content: input.content ?? (reference.kind === "work-item/meta" ? meta : "opening\nbase\nclosing\n"), provenance: { verb: "seed", lifecycleAction: "seed" } });
  if (seeded.status !== "ok") throw new Error(`seed refused: ${seeded.refusal.condition}`);
  const read = await fixture.store.read({ reference: seeded.result.reference });
  if (read.status !== "ok") throw new Error("seed read refused");
  if (reference.kind === "work-item/meta") primaryRecord = read.result;
  const claim = primaryRecord?.reference.kind === "work-item/meta" ? primaryRecord.reference.owner.name : null;
  if (primaryRecord?.reference.kind === "work-item/meta") await writeWorktreeMarker(checkout, {
    spawnedByArc: false, spawningIdentity: identity, createdAt: "2026-11-01T00:00:00Z",
    createdFor: boundWorkUnitSubject(primaryRecord),
  });
  const path = input.path?.startsWith(".arc/user/") || input.path?.startsWith(".arc/active/")
    ? input.path : writeBackFixturePath(read.result.reference);
  const blob = gitBlobId(read.result.content, "sha1");
  const rendered = (content: string, stamp = blob) => path.endsWith(".md") ? renderStampedFile({ content, stamp }) : content;
  await mkdir(dirname(join(checkout, path)), { recursive: true });
  await writeFile(join(checkout, path), rendered(read.result.content));
  const entry: RecordEntry = { kind: "record", reference: read.result.reference,
    stat: await readStat(join(checkout, path)), written: gitBlobId(rendered(read.result.content), "sha1"),
    base: { blob, version: read.result.version }, markers: null, notices: [], unshown: [], protected: false,
    changed: false, pending: false, withheld: false, refused: null, persisted: null, inProgress: null, copies: [] };
  const index: ProjectionIndex = await commitProjectionIndex({ location, checkout, index: {
    format: 2, state: null, projectedUnder: { view: { mode: "mine", pins: [] }, identity, claim, layoutActive: "nested" },
    withheldCopies: [], tripwires: {}, ignoreFiles: null, ignoreGuard: null, entries: { [path]: entry },
  } });
  const reports: WriteBackDiagnostic[] = [];
  const memo = createHistoryMemo(fixture.store);
  const context = { renderer: createRecordRenderer({ store: fixture.store, memo }), store: fixture.store, location, format: "sha1" as const, memo, actor: `${identity}@fixture-machine`,
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

/** Use actual projected addresses for file-backed write tests, including arbitrary scratch extensions. */
export function writeBackFixturePath(reference: RecordReference): string {
  const name = reference.owner.name, kind = reference.kind;
  const artifacts: Partial<Record<KindId, string>> = { "work-item/meta": "meta", "work-item/draft": "draft", "work-item/spec": "spec",
    "work-item/task-list": "tasks", "work-item/notes": "notes" };
  const artifact = artifacts[kind];
  if (artifact !== undefined) return `.arc/active/current/${artifact}-${name}.md`;
  if (kind === "work-item/companion" && typeof reference.key === "string") {
    return `.arc/active/current/${companionStoredName(name, reference.key)}`;
  }
  if (kind === "work-item/description") return `.arc/active/in-flight/${name}/errand-${name}.md`;
  if (kind === "personal/document") return `.arc/user/${name}/${String(reference.key)}`;
  if (kind === "personal/inbox") return `.arc/user/${name}/USER-INBOX.md`;
  if (kind === "personal/working-memory") return `.arc/user/${name}/WORKING-MEMORY.md`;
  if (kind === "cohort/document") return `.arc/backlog/planned/${name}/cohort-${name}.md`;
  throw new Error(`No projected fixture path for ${kind}`);
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
  if (staged.status !== "ok") throw new Error("refresh rendering refused");
  const takeIn = createWriteBackPort(context);
  const guarded = await guardReplacement({ ...context, checkout, path, entry, staged: staged.result,
    reference: await readReference(checkout), takeIn });
  if (guarded.kind !== "replace") throw new Error("refresh was not admitted");
  const swapped = await swapBatch({ ...context, checkout, index, files: [{ path, replace: guarded }], readBack: false, takeIn, hooks });
  return (await runSecondCheck({ ...context, checkout, index: swapped.index, copies: swapped.copies, takeIn })).index;
}
