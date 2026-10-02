/** Saved branch anchors and provenance over tracked records. */
import { StateVersionSchema, RecordVersionSchema, type StateVersion, type RecordReference } from "../identity.js";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import type { ChangesInput, HistoryEntry } from "../contract.js";
import type { InRepoContext } from "./context.js";
import { selectMeta, type MetaSource } from "./meta.js";
import { recordPath } from "./paths.js";
import { readFileAt } from "./files.js";
import { notFound, unsupported } from "./refusals.js";
import { listTracked } from "./list.js";
import { familyOf, type KindId } from "../catalog.js";

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
  historyAdmission(context, reference);
  const home = context.registry[reference.kind].inRepo;
  const needsMeta = home.address?.kind === "work-unit-artifact" || home.finder === "companions";
  const liveMeta = needsMeta ? await selectMeta(context, reference.owner.name) : undefined;
  const revision = liveMeta?.revision ?? "HEAD";
  const meta = liveMeta ?? (needsMeta ? await historicalMeta(context, reference.owner.name, revision) : undefined);
  if (needsMeta && meta === undefined) return notFound(reference, "Check the record name or commit its file before asking for history.");
  let path = await recordPath(context, reference, meta, revision);
  const commits = (await git(context, ["log", "--follow", "--format=%H", revision, "--", `:(literal)${path}`])).trim().split("\n").filter(Boolean);
  if (commits.length === 0) return notFound(reference, "Check the record name or commit its file before asking for history.");
  const entries: HistoryEntry[] = [];
  for (const commit of commits) {
    entries.push(await historyEntry(context, reference, path, commit));
    path = await previousPath(context, path, commit);
  }
  return entries;
}

async function historicalMeta(context: InRepoContext, slug: string, revision: string): Promise<MetaSource | undefined> {
  const commits = (await git(context, ["log", "--format=%H", revision, "--", `:(glob).arc/**/meta-${slug}.md`])).trim().split("\n").filter(Boolean);
  for (const commit of commits) {
    const meta = await selectMeta(context, slug, commit);
    if (meta !== undefined) return meta;
  }
  return undefined;
}
/** Read interval provenance for records with differing endpoint bytes.
 * @param context - Explicit repository dependencies.
 * @param input - Saved-state interval and optional record restriction.
 * @returns Changes in chronological commit order.
 */
export async function trackedChanges(context: InRepoContext, input: ChangesInput): Promise<HistoryEntry[]> {
  const references = input.references ?? await endpointReferences(context, input);
  const changed = await changedEndpoints(context, input, references);
  const commits = (await git(context, ["rev-list", "--reverse", "--topo-order", input.to, "--not", input.from])).trim().split("\n").filter(Boolean);
  const entries: HistoryEntry[] = [];
  for (const commit of commits) {
    const paths = new Set((await git(context, ["diff-tree", "--root", "-m", "--no-commit-id", "-r", "--name-only", "-z", commit])).split("\0").filter(Boolean));
    for (const item of changed) {
      const path = await pathAt(context, item.reference, commit);
      if (item.paths.some((endpoint) => paths.has(endpoint)) || (path !== undefined && paths.has(path))) {
        const changedPath = path ?? item.paths[0];
        if (changedPath === undefined) throw new Error("A changed record has no endpoint path");
        entries.push(await historyEntry(context, item.reference, changedPath, commit));
      }
    }
  }
  return entries;
}

async function changedEndpoints(context: InRepoContext, input: ChangesInput, references: RecordReference[]): Promise<{ reference: RecordReference; paths: string[] }[]> {
  const changed: { reference: RecordReference; paths: string[] }[] = [];
  for (const reference of references) {
    changesAdmission(context, reference);
    const fromPath = await pathAt(context, reference, input.from);
    const toPath = await pathAt(context, reference, input.to);
    const before = fromPath === undefined ? null : await readFileAt(context, fromPath, input.from);
    const after = toPath === undefined ? null : await readFileAt(context, toPath, input.to);
    if (before === null && after === null && input.references !== undefined) await uncoveredOrMissing(context, reference);
    if (before !== after || fromPath !== toPath) changed.push({ reference, paths: [...new Set([fromPath, toPath].filter((path): path is string => path !== undefined))] });
  }
  return changed;
}

function changesAdmission(context: InRepoContext, reference: RecordReference): void {
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

async function endpointReferences(context: InRepoContext, input: ChangesInput): Promise<RecordReference[]> {
  const references = new Map<string, RecordReference>();
  const kinds = Object.keys(context.registry) as KindId[];
  for (const revision of [input.from, input.to]) {
    for (const kind of kinds.filter((kind) => context.registry[kind].inRepo.substrate === "tracked")) {
      const listing = await listTracked(context, { family: familyOf(kind), kind, asOf: revision });
      if (listing.status === "unreadable") throw new Error(listing.condition);
      if (listing.status !== "complete") continue;
      for (const { reference } of listing.records) references.set(JSON.stringify(reference), reference);
    }
  }
  return [...references.values()];
}

function historyAdmission(context: InRepoContext, reference: RecordReference): void {
  const substrate = context.registry[reference.kind].inRepo.substrate;
  if (substrate === "none") unsupported("unhomed-kind", "This record has no home before the store cutover.", "Use a kind housed by the current backend.");
  if (substrate === "personal") unsupported("personal-history", "Personal files have no history in this backend.", "Read the current personal file instead.");
  if (substrate !== "tracked") unsupported("uncovered-state-version", "The branch anchor does not cover this record's substrate.", "Use the record's own version instead.");
}

async function git(context: InRepoContext, args: string[]): Promise<string> {
  return (await context.ports.exec("git", args, { cwd: context.ports.checkoutRoot, objectAccess: "local-only" })).stdout;
}

async function historyEntry(context: InRepoContext, reference: RecordReference, path: string, commit: string): Promise<HistoryEntry> {
  const content = await readFileAt(context, path, commit);
  const object = await context.ports.execInput(["cat-file", "commit", commit], "", {
    cwd: context.ports.checkoutRoot, objectAccess: "local-only",
  });
  const separator = object.indexOf("\n\n");
  if (separator === -1) throw new Error("Git returned a commit without a header boundary");
  return { reference, version: content === null ? null : RecordVersionSchema.parse(digestBytes(Buffer.from(content))),
    provenance: { message: object.slice(separator + 2) } };
}

async function previousPath(context: InRepoContext, path: string, commit: string): Promise<string> {
  const output = await git(context, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", commit]);
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
