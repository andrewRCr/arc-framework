/** The fence harness over a copy of one repository's store, so a rehearsal can run it over the writes a window makes. */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { KIND_REGISTRY } from "../../../src/lib/store/registry.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, type RecordReference } from "../../../src/lib/store/identity.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { cohortDocumentParent } from "../../../src/lib/store/kinds/cohort/check-support.js";
import { writeMetaTitle } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { runArchive } from "../../../src/lib/work-unit/verbs/archive.js";
import { prepareWriteBack } from "../../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../../src/lib/store/projection/submission.js";
import type { ObjectFormat } from "../../../src/lib/store/projection/blob-id.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { LookupInput } from "../../../src/lib/store/lookup.js";
import type { BatchInput } from "../../../src/lib/store/write.js";
import type { ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { projectRecordForWriteBack } from "./projection/write-back-fixture.js";
import { dryRun, runFenceCase, type FenceOutcome, type FenceWriter } from "./fence-harness.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]): Promise<string> => (await exec("git", args, { cwd })).stdout.trim();
const changeProvenance = { verb: "fence-change", lifecycleAction: "edit" } as const;

/** One prepared write a window makes: an archive, or a hand edit of one record taken in through write-back. */
export type FencePlan = { kind: "archive"; name: string; prUrl: string; clock: Date }
  | { kind: "edit"; reference: RecordReference; edit: (content: string) => string };

/** One case's change and what the fence did with it. */
export interface FenceCaseReport { readonly writer: string; readonly change: string; readonly outcome: FenceOutcome }

interface FenceChange { name: string; apply: (store: Store) => Promise<void> }

/** An archive's executor, which reaches the store alone: every tracked-artifact port refuses. */
export function storeOnlyTransition(store: Store, cwd: string): ExecuteTransitionContext {
  const forbidden = async (): Promise<never> => { throw new Error("tracked artifact access"); };
  return { cwd, store, indexFs: { readdir: forbidden, readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
}

/** Archive one work unit through the store as `arc archive` does. */
export function archiveWriter(plan: Extract<FencePlan, { kind: "archive" }>, cwd: string): FenceWriter {
  return { name: `archive ${plan.name}`, run: store => runArchive({ executor: storeOnlyTransition(store, cwd), fs: { readdir: async () => [] },
    clock: () => plan.clock }, { name: plan.name, prUrl: plan.prUrl }) };
}

/** Project one record, edit it, and return the writer that takes the edit in through write-back. */
export async function editWriter(store: Store, plan: Extract<FencePlan, { kind: "edit" }>, identity: string,
  format: ObjectFormat = "sha1"): Promise<{ writer: FenceWriter; dispose: () => Promise<void> }> {
  const read = await store.read({ reference: plan.reference });
  if (read.status !== "ok") throw new Error(`The edited record is unreadable: ${read.refusal.condition}`);
  const record = read.result;
  const checkout = await mkdtemp(join(tmpdir(), "arc-read-back-"));
  const dispose = () => rm(checkout, { recursive: true, force: true });
  try {
    const projected = await projectRecordForWriteBack({ store, record, identity, format, checkout,
      primary: record.reference.kind === "work-item/meta" ? record : null });
    await projected.edit(plan.edit(record.content));
    return { dispose, writer: { name: `edit ${record.reference.kind}:${record.reference.owner.name}`, run: async target => {
      const context = { ...projected.context, store: target };
      const ready = await prepareWriteBack(context, projected.request);
      if (ready.kind !== "ready") return ready;
      const prepared = await prepareIndexedProjectionSubmission(context, projected.request, ready);
      return prepared.status === "ok" ? target.batch(prepared.result.batch) : prepared;
    } } };
  } catch (error) {
    await dispose();
    throw error;
  }
}

function recordEdit(reference: RecordReference, label: string): FenceChange {
  return { name: `edit ${label}`, apply: async target => {
    const current = await target.read({ reference });
    if (current.status !== "ok") throw new Error(`The read record is unreadable: ${current.refusal.condition}`);
    const written = await target.write({ ...recordPut(current.result, { content: `${current.result.content}\nConcurrent note.\n` }), provenance: changeProvenance });
    if (written.status !== "ok") throw new Error(`The change to ${label} was refused: ${written.refusal.condition}`);
  } };
}

function memberArrival(identity: string, cohort: string | null): FenceChange {
  return { name: cohort === null ? "add an active work unit" : `add a member to ${cohort}`, apply: async target => {
    const name = SlugSchema.parse(`fence-member-${randomUUID()}`);
    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
    const written = await target.write({ action: "put", reference, expected: null, placement: { kind: "active" },
      content: makeMetaFixture(name, { owner: identity, ...(cohort === null ? {} : { cohort }) }), provenance: changeProvenance });
    if (written.status !== "ok") throw new Error(`Adding work unit ${name} was refused: ${written.refusal.condition}`);
  } };
}

function cohortArrival(parent: string | null): FenceChange {
  return { name: parent === null ? "add an open cohort" : `add an open subcohort to ${parent}`, apply: async target => {
    const name = SlugSchema.parse(`fence-cohort-${randomUUID()}`);
    const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
    const parentField = parent === null ? "[none]" : `\`${parent}\``;
    const content = `# Cohort: \`${name}\`\n\n**Parent:** ${parentField}\n\n**Purpose:** Coordinate the work.\n\n---\n`;
    const written = await target.write({ action: "put", reference, expected: null, content, provenance: changeProvenance });
    if (written.status !== "ok") throw new Error(`Adding cohort ${name} was refused: ${written.refusal.condition}`);
  } };
}

async function slugRename(store: Store, input: Extract<LookupInput, { kind: "slug" }>): Promise<FenceChange | undefined> {
  const found = await store.lookup(input);
  if (found.status !== "ok" || found.result.reference.kind !== "work-item/meta") return undefined;
  return { name: `rename the work unit resolved by ${input.slug}`, apply: async target => {
    const current = await target.read({ reference: found.result.reference });
    if (current.status !== "ok") throw new Error(`The lookup target is unreadable: ${current.refusal.condition}`);
    const name = SlugSchema.parse(`fence-renamed-${randomUUID()}`);
    const reference = RecordReferenceSchema.parse({ ...current.result.reference, owner: { ...current.result.reference.owner, name } });
    const written = await target.write({ ...recordPut(current.result, { content: writeMetaTitle(current.result.content, name) }),
      reference, provenance: { ...changeProvenance, lifecycleAction: "rename" } });
    if (written.status !== "ok") throw new Error(`Renaming the work unit resolved by ${input.slug} was refused: ${written.refusal.condition}`);
  } };
}

/** Perturb the observed Markdown, lifecycle inventories, and slug resolutions, then add an unrelated write. */
export async function fenceChanges(store: Store, writer: FenceWriter, identity: string): Promise<FenceChange[]> {
  const { reads, batch } = await dryRun(store, writer);
  const cohorts = await currentOpenCohorts(store, batch);
  const memberCohort = cohorts.find(cohort => cohort.closing) ?? cohorts[0];
  const memberPath = memberCohort?.parent ? `${memberCohort.parent}/${memberCohort.name}` : memberCohort?.name ?? null;
  const parent = cohorts.find(cohort => cohort.parent === null);
  const changes: FenceChange[] = [];
  for (const read of reads) {
    if (read.operation === "read" && KIND_REGISTRY[read.reference.kind].projection !== "never") {
      changes.push(recordEdit(read.reference, read.target));
    } else if (read.operation === "list" && read.input.kind === "work-item/meta") {
      changes.push(memberArrival(identity, memberPath));
    } else if (read.operation === "list" && read.input.kind === "cohort/document") {
      changes.push(cohortArrival(parent?.name ?? null));
    } else if (read.operation === "lookup" && read.input.kind === "slug") {
      const rename = await slugRename(store, read.input);
      if (rename !== undefined) changes.push(rename);
    }
  }
  const unrelated = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: identity }), "scratch/fence-unrelated.md");
  return [...changes, { name: "an unrelated write", apply: async target => {
    const written = await target.write({ action: "put", reference: unrelated, expected: null, content: "Unrelated.\n", provenance: changeProvenance });
    if (written.status !== "ok") throw new Error(`The unrelated write was refused: ${written.refusal.condition}`);
  } }];
}

// Arrivals land before the prepared batch, so they must use the current cohort hierarchy.
async function currentOpenCohorts(store: Store, batch: BatchInput | undefined) {
  const cohorts: { name: string; parent: string | null; closing: boolean }[] = [];
  for (const write of batch?.writes ?? []) {
    if (write.action !== "put" || write.reference.kind !== "cohort/document") continue;
    const current = await store.read({ reference: write.reference });
    if (current.status !== "ok" || current.result.placement !== undefined) continue;
    const parent = cohortDocumentParent(current.result.content);
    if (parent === undefined) continue;
    cohorts.push({ name: current.result.reference.owner.name, parent, closing: write.placement?.kind === "completed" });
  }
  return cohorts;
}

async function storeGitDir(source: string): Promise<string> {
  const common = await git(source, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const separate = join(common, "arc", "store");
  return stat(join(separate, "HEAD")).then(() => separate, () => common);
}

/** Copy a repository's `refs/arc/*` into a scratch repository with no remote, so nothing a writer does reaches the source. */
export async function copyRepositoryStore(source: string, identity: string): Promise<{ root: string; store: Store; format: ObjectFormat; dispose: () => Promise<void> }> {
  const sourceStore = await storeGitDir(source);
  const format = await git(sourceStore, "rev-parse", "--show-object-format");
  if (format !== "sha1" && format !== "sha256") {
    throw new Error(`The store uses Git object format ${format}. Select a SHA-1 or SHA-256 store and retry the rehearsal.`);
  }
  const root = await mkdtemp(join(tmpdir(), "arc-fence-copy-"));
  const dispose = () => rm(root, { recursive: true, force: true });
  try {
    await git(root, "init", "--quiet", "-b", "main", `--object-format=${format}`);
    for (const [key, value] of [["user.name", identity], ["user.email", `${identity}@example.test`], ["arc.identity", identity]] as const) {
      await git(root, "config", key, value);
    }
    await git(root, "commit", "--quiet", "--allow-empty", "-m", "Hold the copied store");
    await git(root, "fetch", "--quiet", "--no-tags", sourceStore, "+refs/arc/*:refs/arc/*");
    return { root, format, store: createRefStore(createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null })), dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function withCopiedWriter<T>(source: string, plan: FencePlan, identity: string,
  run: (store: Store, writer: FenceWriter) => Promise<T>): Promise<T> {
  const copy = await copyRepositoryStore(source, identity);
  try {
    if (plan.kind === "archive") return await run(copy.store, archiveWriter(plan, copy.root));
    const edit = await editWriter(copy.store, plan, identity, copy.format);
    try {
      return await run(copy.store, edit.writer);
    } finally {
      await edit.dispose();
    }
  } finally {
    await copy.dispose();
  }
}

/**
 * Run the fence over each prepared write a window makes, on a fresh copy of the repository's store per change.
 *
 * Compare the source refs before and after the cases to detect any write back to the source.
 */
export async function runFenceOverRepository(source: string, plans: readonly FencePlan[], identity: string): Promise<FenceCaseReport[]> {
  const before = await git(await storeGitDir(source), "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/");
  const reports: FenceCaseReport[] = [];
  for (const plan of plans) {
    const changes = await withCopiedWriter(source, plan, identity, (store, writer) => fenceChanges(store, writer, identity));
    for (const change of changes) {
      reports.push(await withCopiedWriter(source, plan, identity, async (store, writer) => ({
        writer: writer.name, change: change.name, outcome: await runFenceCase(store, writer, change.apply),
      })));
    }
  }
  const after = await git(await storeGitDir(source), "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/");
  if (after !== before) throw new Error("The fence harness changed the source repository's store.");
  return reports;
}
