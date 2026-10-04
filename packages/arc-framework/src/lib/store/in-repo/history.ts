/** Saved branch anchors and provenance over tracked records. */
import { StateVersionSchema, RecordVersionSchema, RecordReferenceSchema, type StateVersion, type RecordReference } from "../identity.js";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import type { ChangesInput, HistoryEntry } from "../contract.js";
import type { InRepoContext } from "./context.js";
import { selectMeta } from "./meta.js";
import { recordPath } from "./paths.js";
import { readFileAt } from "./files.js";
import { notFound, unsupported } from "./refusals.js";
import { trackedReferences } from "./list.js";
import { personalIdentity } from "./personal-paths.js";
import { admitTrackedOwner } from "./tracked-identity.js";
import { admitTransient } from "./transient-common.js";

/** Return the branch's saved state anchor.
 * @param context - Explicit repository dependencies.
 * @returns The current branch tip.
 */
export async function stateVersion(context: InRepoContext): Promise<StateVersion> {
  const result = await context.ports.exec("git", ["rev-parse", "HEAD"], {
    cwd: context.ports.checkoutRoot, objectAccess: "local-only",
  });
  return StateVersionSchema.parse(result.stdout.trim());
}
/** Read tracked versions newest first, conserving commit messages.
 * @param context - Explicit repository dependencies.
 * @param input - Logical record whose file history is requested.
 * @returns The record's landed versions.
 */
export async function trackedHistory(context: InRepoContext, input: { reference: RecordReference }): Promise<HistoryEntry[]> {
  const reference = input.reference;
  await historyAdmission(context, reference);
  const home = context.registry[reference.kind].inRepo;
  const needsMeta = home.address?.kind === "work-unit-artifact" || home.finder === "companions";
  const liveMeta = needsMeta ? await selectMeta(context, reference.owner.name) : undefined;
  const revision = liveMeta?.revision ?? "HEAD";
  if (needsMeta) return logicalHistory(context, reference, revision);
  let path = await recordPath(context, reference, undefined, revision);
  const commits = (await git(context, ["log", "--follow", "--topo-order", "--format=%H", revision, "--", `:(literal)${path}`])).trim().split("\n").filter(Boolean);
  if (commits.length === 0) return notFound(reference, "Check the record name or commit its file before asking for history.");
  const entries: HistoryEntry[] = [];
  for (const commit of commits) {
    entries.push(await historyEntry(context, reference, await readFileAt(context, path, commit), commit));
    path = await previousPath(context, path, commit);
  }
  return entries;
}

async function logicalHistory(context: InRepoContext, reference: RecordReference, revision: string): Promise<HistoryEntry[]> {
  const rows = (await git(context, ["rev-list", "--topo-order", "--parents", revision])).trim().split("\n").filter(Boolean);
  const names = new Map<string, RecordReference>();
  const entries: HistoryEntry[] = [];
  for (const row of rows) {
    const [commit, ...parents] = row.split(" ");
    if (commit === undefined) throw new Error("Git returned a revision without an object ID");
    const selected = names.get(commit) ?? reference;
    for (const parent of parents) {
      if (!names.has(parent)) names.set(parent, await previousReference(context, selected, commit, parent));
    }
    const parent = parents[0];
    const before = parent === undefined ? { path: undefined, content: null }
      : await recordAt(context, names.get(parent) ?? selected, parent);
    const after = await recordAt(context, selected, commit);
    if (before.content === after.content && (after.content === null || before.path === after.path)) continue;
    entries.push(await historyEntry(context, reference, after.content, commit));
  }
  if (entries.length === 0) return notFound(reference, "Check the record name or commit its file before asking for history.");
  return entries;
}

async function previousReference(context: InRepoContext, reference: RecordReference, commit: string, parent: string): Promise<RecordReference> {
  if (await selectMeta(context, reference.owner.name, parent) !== undefined) return reference;
  const meta = await selectMeta(context, reference.owner.name, commit);
  if (meta === undefined) return reference;
  const path = await previousPath(context, meta.path, commit, parent);
  if (path === meta.path) return reference;
  const name = /(?:^|\/)meta-(.+)\.md$/u.exec(path)?.[1];
  if (name === undefined || (await selectMeta(context, name, parent))?.path !== path) return reference;
  return RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name } });
}
/** Read every landed record mutation inside a saved-state interval.
 * @param context - Explicit repository dependencies.
 * @param input - Saved-state interval and optional record restriction.
 * @returns Changes in chronological commit order.
 */
export async function trackedChanges(context: InRepoContext, input: ChangesInput): Promise<HistoryEntry[]> {
  for (const reference of input.references ?? []) await changesAdmission(context, reference);
  const commits = await intervalCommits(context, input);
  const revisions = [...new Set([input.from, input.to, ...commits.flatMap((commit) => [commit.revision, ...commit.parents])])];
  const references = input.references ?? await intervalReferences(context, revisions);
  await admitIntervalRecords(context, input, references, revisions);
  const entries: HistoryEntry[] = [];
  for (const commit of commits) {
    const parent = commit.parents[0];
    for (const reference of references) {
      const before = parent === undefined ? { path: undefined, content: null } : await recordAt(context, reference, parent);
      const after = await recordAt(context, reference, commit.revision);
      if (before.content === after.content && (after.content === null || before.path === after.path)) continue;
      entries.push(await historyEntry(context, reference, after.content, commit.revision));
    }
  }
  return entries;
}

async function intervalCommits(context: InRepoContext, input: ChangesInput): Promise<{ revision: string; parents: string[] }[]> {
  const revisions = (await git(context, ["rev-list", "--reverse", "--topo-order", input.to, "--not", input.from])).trim().split("\n").filter(Boolean);
  const commits: { revision: string; parents: string[] }[] = [];
  for (const revision of revisions) {
    const parents = (await git(context, ["rev-list", "--parents", "-n", "1", revision])).trim().split(" ").slice(1);
    commits.push({ revision, parents });
  }
  return commits;
}

async function admitIntervalRecords(context: InRepoContext, input: ChangesInput, references: RecordReference[], revisions: string[]): Promise<void> {
  for (const reference of references) {
    await changesAdmission(context, reference);
    let present = false;
    for (const revision of revisions) {
      const path = await pathAt(context, reference, revision);
      if (path === undefined) continue;
      if (await readFileAt(context, path, revision) !== null) present = true;
    }
    if (!present && input.references !== undefined) await uncoveredOrMissing(context, reference);
  }
}

async function recordAt(context: InRepoContext, reference: RecordReference, revision: string): Promise<{ path: string | undefined; content: string | null }> {
  const path = await pathAt(context, reference, revision);
  return { path, content: path === undefined ? null : await readFileAt(context, path, revision) };
}

async function changesAdmission(context: InRepoContext, reference: RecordReference): Promise<void> {
  await identityAdmission(context, reference);
  if (context.registry[reference.kind].inRepo.substrate !== "tracked") unsupported("uncovered-state-version",
    "The branch's saved state does not cover this record.", "Read and check the record's own per-record version instead.");
}

async function pathAt(context: InRepoContext, reference: RecordReference, revision: string): Promise<string | undefined> {
  const home = context.registry[reference.kind].inRepo;
  const needsMeta = home.address?.kind === "work-unit-artifact" || home.finder === "companions";
  const meta = needsMeta ? await selectMeta(context, reference.owner.name, revision) : undefined;
  if (needsMeta && meta === undefined) return undefined;
  return recordPath(context, reference, meta, revision);
}

async function uncoveredOrMissing(context: InRepoContext, reference: RecordReference): Promise<never> {
  const meta = reference.owner.type === "work-item" ? await selectMeta(context, reference.owner.name) : undefined;
  if (meta?.revision !== undefined && await readFileAt(context, await recordPath(context, reference, meta), meta.revision) !== null) {
    return unsupported("uncovered-state-version", "The selected record lives on another branch outside these saved states.",
      "Read the live record and check its own per-record version instead.");
  }
  return notFound(reference, "Check the record name or create its meta and file together before retrying changes.");
}

async function intervalReferences(context: InRepoContext, revisions: string[]): Promise<RecordReference[]> {
  const references = new Map<string, RecordReference>();
  for (const revision of revisions) {
    for (const reference of await trackedReferences(context,StateVersionSchema.parse(revision))) references.set(JSON.stringify(reference),reference);
  }
  return [...references.values()];
}

async function historyAdmission(context: InRepoContext, reference: RecordReference): Promise<void> {
  await identityAdmission(context, reference);
  const substrate = context.registry[reference.kind].inRepo.substrate;
  if (substrate === "none") unsupported("unhomed-kind", "This record has no home before the store cutover.", "Use a kind housed by the current backend.");
  if (substrate === "personal") unsupported("personal-history", "Personal files have no history in this backend.", "Read the current personal file instead.");
  if (substrate !== "tracked") unsupported("uncovered-state-version", "The branch anchor does not cover this record's substrate.", "Use the record's own version instead.");
}

async function identityAdmission(context: InRepoContext, reference: RecordReference): Promise<void> {
  const substrate = context.registry[reference.kind].inRepo.substrate;
  if (substrate === "tracked") admitTrackedOwner(reference.owner);
  if (substrate === "personal") await personalIdentity(context, reference);
  if (substrate === "transient-identity") admitTransient(reference, await context.ports.identity());
}

async function git(context: InRepoContext, args: string[]): Promise<string> {
  return (await context.ports.exec("git", args, { cwd: context.ports.checkoutRoot, objectAccess: "local-only" })).stdout;
}

async function historyEntry(context: InRepoContext, reference: RecordReference, content: string | null, commit: string): Promise<HistoryEntry> {
  const object = await context.ports.execInput(["cat-file", "commit", commit], "", {
    cwd: context.ports.checkoutRoot, objectAccess: "local-only",
  });
  const separator = object.indexOf("\n\n");
  if (separator === -1) throw new Error("Git returned a commit without a header boundary");
  return { reference, content, version: content === null ? null : RecordVersionSchema.parse(digestBytes(Buffer.from(content))),
    provenance: { message: object.slice(separator + 2) } };
}

async function previousPath(context: InRepoContext, path: string, commit: string, parent?: string): Promise<string> {
  const output = await git(context, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", ...(parent === undefined ? [] : [parent]), commit]);
  const fields = output.split("\0");
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const oldPath = fields[index++];
    if (status?.startsWith("R") || status?.startsWith("C")) {
      const newPath = fields[index++];
      if (status.startsWith("R") && newPath === path && oldPath !== undefined) return oldPath;
    }
  }
  return path;
}
