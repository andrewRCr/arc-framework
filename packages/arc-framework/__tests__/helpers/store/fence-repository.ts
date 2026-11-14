/** The fence harness over a copy of one repository's store, so a rehearsal can run it over the writes a window makes. */
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { KIND_REGISTRY } from "../../../src/lib/store/registry.js";
import { OwnerIdentitySchema, recordReferences, type RecordReference } from "../../../src/lib/store/identity.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { runArchive } from "../../../src/lib/work-unit/verbs/archive.js";
import { prepareWriteBack } from "../../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../../src/lib/store/projection/submission.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
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
export async function editWriter(store: Store, plan: Extract<FencePlan, { kind: "edit" }>, identity: string): Promise<{ writer: FenceWriter; dispose: () => Promise<void> }> {
  const read = await store.read({ reference: plan.reference });
  if (read.status !== "ok") throw new Error(`The edited record is unreadable: ${read.refusal.condition}`);
  const record = read.result;
  const projected = await projectRecordForWriteBack({ store, record, identity, primary: record.reference.kind === "work-item/meta" ? record : null });
  await projected.edit(plan.edit(record.content));
  return { dispose: projected.dispose, writer: { name: `edit ${record.reference.kind}:${record.reference.owner.name}`, run: async target => {
    const context = { ...projected.context, store: target };
    const ready = await prepareWriteBack(context, projected.request);
    if (ready.kind !== "ready") return ready;
    const prepared = await prepareIndexedProjectionSubmission(context, projected.request, ready);
    return prepared.status === "ok" ? target.batch(prepared.result.batch) : prepared;
  } } };
}

/** A change to each Markdown record the writer read before its batch, and one write it read nothing of. */
export async function fenceChanges(store: Store, writer: FenceWriter, identity: string): Promise<{ name: string; apply: (store: Store) => Promise<void> }[]> {
  const { reads } = await dryRun(store, writer);
  const changes = reads.flatMap(read => read.operation !== "read" || read.reference === undefined
    || KIND_REGISTRY[read.reference.kind].projection === "never" ? [] : [{ name: `edit ${read.target}`, apply: async (target: Store) => {
    const current = await target.read({ reference: read.reference as RecordReference });
    if (current.status !== "ok") throw new Error(`The read record is unreadable: ${current.refusal.condition}`);
    const written = await target.write({ ...recordPut(current.result, { content: `${current.result.content}\nConcurrent note.\n` }), provenance: changeProvenance });
    if (written.status !== "ok") throw new Error(`The change to ${read.target} was refused: ${written.refusal.condition}`);
  } }]);
  const unrelated = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: identity }), "scratch/fence-unrelated.md");
  return [...changes, { name: "an unrelated write", apply: async target => {
    const written = await target.write({ action: "put", reference: unrelated, expected: null, content: "Unrelated.\n", provenance: changeProvenance });
    if (written.status !== "ok") throw new Error(`The unrelated write was refused: ${written.refusal.condition}`);
  } }];
}

async function storeGitDir(source: string): Promise<string> {
  const common = await git(source, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const separate = join(common, "arc", "store");
  return stat(join(separate, "HEAD")).then(() => separate, () => common);
}

/** Copy a repository's `refs/arc/*` into a scratch repository with no remote, so nothing a writer does reaches the source. */
export async function copyRepositoryStore(source: string, identity: string): Promise<{ root: string; store: Store; dispose: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "arc-fence-copy-"));
  await git(root, "init", "--quiet", "-b", "main");
  for (const [key, value] of [["user.name", identity], ["user.email", `${identity}@example.test`], ["arc.identity", identity]]) {
    await git(root, "config", key as string, value as string);
  }
  await git(root, "commit", "--quiet", "--allow-empty", "-m", "Hold the copied store");
  await git(root, "fetch", "--quiet", "--no-tags", await storeGitDir(source), "+refs/arc/*:refs/arc/*");
  return { root, store: createRefStore(createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null })),
    dispose: () => rm(root, { recursive: true, force: true }) };
}

/**
 * Run the fence over each prepared write a window makes, on a fresh copy of the repository's store per change.
 *
 * Each record a writer reads gets a change, and one write it reads nothing of joins them; the source's refs are compared
 * before and after, since a copy must never write back to it.
 */
export async function runFenceOverRepository(source: string, plans: readonly FencePlan[], identity: string): Promise<FenceCaseReport[]> {
  const before = await git(await storeGitDir(source), "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/");
  const reports: FenceCaseReport[] = [];
  for (const plan of plans) {
    const probe = await copyRepositoryStore(source, identity);
    const probeWriter = plan.kind === "archive" ? { writer: archiveWriter(plan, probe.root), dispose: async () => {} }
      : await editWriter(probe.store, plan, identity);
    const changes = await fenceChanges(probe.store, probeWriter.writer, identity);
    await probeWriter.dispose();
    await probe.dispose();
    for (const change of changes) {
      const copy = await copyRepositoryStore(source, identity);
      const subject = plan.kind === "archive" ? { writer: archiveWriter(plan, copy.root), dispose: async () => {} }
        : await editWriter(copy.store, plan, identity);
      try {
        reports.push({ writer: subject.writer.name, change: change.name, outcome: await runFenceCase(copy.store, subject.writer, change.apply) });
      } finally { await subject.dispose(); await copy.dispose(); }
    }
  }
  const after = await git(await storeGitDir(source), "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/");
  if (after !== before) throw new Error("The fence harness changed the source repository's store.");
  return reports;
}
