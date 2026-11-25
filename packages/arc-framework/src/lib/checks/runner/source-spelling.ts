/** Relate canonical catalog names to literal stored spellings without normalizing source names. */
import type { BigIntStats } from "node:fs";
import { join } from "node:path";
import { SourceEntryPathSchema } from "./contract-source.js";
import { resolveSourceCwd } from "./source-cwd.js";
import { SourceCaptureError } from "./source-error.js";
import type { SourcePresentationIO } from "./source-io.js";
import { decodeSourceText } from "./source-paths.js";

interface ParentNames {
  names: Map<string, Uint8Array>;
  expected: Set<string>;
  identities?: Map<string, string[]>;
}
interface SpellingContext {
  io: SourcePresentationIO; root: string; parents: Map<string, ParentNames>; aliases: Map<string, string>;
}
/** A run-owned mapping proof, rechecked after all source entries have been copied. */
export interface SourceSpellingIndex {
  resolve(codePath: string): Promise<string>;
  recheck(): Promise<void>;
}

function identity(stat: BigIntStats): string {
  if (stat.ino === 0n) throw new SourceCaptureError("Source path filesystem identity is unavailable for literal spelling");
  return `${stat.dev}:${stat.ino}:${stat.mode & 0o170000n}`;
}

function nameKey(bytes: Uint8Array): string { return Buffer.from(bytes).toString("hex"); }

/** Refuse a parent that does not physically resolve inside the source root, observing it through the capture IO. */
async function assertContainedParent(context: SpellingContext, parent: string): Promise<void> {
  try { await resolveSourceCwd(context.root, parent, context.io); }
  catch (cause) { throw new SourceCaptureError("Source path parent is not a contained directory", { cause }); }
}

async function parentNames(context: SpellingContext, parent: string): Promise<ParentNames> {
  let names = context.parents.get(parent);
  if (names === undefined) {
    // Each parent is validated once per pass here and once more by the closing recheck.
    await assertContainedParent(context, parent);
    names = { names: new Map((await context.io.readDirectory(parent)).map(name => [nameKey(name), name])), expected: new Set() };
    context.parents.set(parent, names);
  }
  return names;
}

async function indexIdentities(io: SourcePresentationIO, parent: string, names: ParentNames): Promise<Map<string, string[]>> {
  if (names.identities !== undefined) return names.identities;
  const indexed = new Map<string, string[]>();
  for (const bytes of names.names.values()) {
    let name: string;
    try { name = decodeSourceText(bytes); } catch { continue; }
    let stat: BigIntStats;
    try { stat = await io.lstat(join(parent, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (stat.ino === 0n) continue;
    const key = identity(stat);
    const spellings = indexed.get(key) ?? [];
    spellings.push(name);
    indexed.set(key, spellings);
  }
  names.identities = indexed;
  return indexed;
}

async function storedName(context: SpellingContext, parent: string, component: string): Promise<string> {
  const names = await parentNames(context, parent);
  const exact = names.names.get(nameKey(Buffer.from(component)));
  let name: string;
  if (exact !== undefined) name = decodeSourceText(exact);
  else {
    const requested = await context.io.lstat(join(parent, component));
    const candidates = (await indexIdentities(context.io, parent, names)).get(identity(requested)) ?? [];
    if (candidates.length !== 1) throw new SourceCaptureError("Source path has ambiguous or unavailable literal filesystem spellings");
    name = candidates[0] ?? "";
  }
  names.expected.add(nameKey(Buffer.from(name)));
  return name;
}

async function resolveSpelling(context: SpellingContext, codePath: string): Promise<string> {
  const components: string[] = [];
  for (const component of codePath.split("/")) {
    components.push(await storedName(context, join(context.root, ...components), component));
    if (!SourceEntryPathSchema.safeParse(components.join("/")).success) {
      throw new SourceCaptureError("Source filesystem spelling is not a representable source path");
    }
  }
  const resolved = components.join("/");
  if (resolved !== codePath) context.aliases.set(codePath, resolved);
  return resolved;
}

async function recheckSpellings(context: SpellingContext): Promise<void> {
  for (const [parent, names] of context.parents) {
    await assertContainedParent(context, parent);
    const current = new Set((await context.io.readDirectory(parent)).map(nameKey));
    if ([...names.expected].some(name => !current.has(name))) throw new SourceCaptureError("Source filesystem path spelling changed during capture");
  }
  for (const [codePath, path] of context.aliases) {
    const [catalog, actual] = await Promise.all([context.io.lstat(join(context.root, codePath)), context.io.lstat(join(context.root, path))]);
    if (identity(catalog) !== identity(actual)) throw new SourceCaptureError("Source catalog alias changed during capture");
  }
}

/** Resolve catalog aliases by filesystem identity while retaining actual UTF-8 stored names. */
export function createSourceSpellingIndex(io: SourcePresentationIO, root: string): SourceSpellingIndex {
  const context: SpellingContext = { io, root, parents: new Map(), aliases: new Map() };
  return { resolve: path => resolveSpelling(context, path), recheck: () => recheckSpellings(context) };
}
