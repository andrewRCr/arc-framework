/** Personal scratch follows logical work-unit names without merging people's files. */
import { lstat, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ParsedMetaRecordSchema } from "./active/meta-schema.js";
import { SlugSchema } from "./kernel/index.js";
import { materializeArcPath, resolveArcPath } from "./layout/index.js";
import { parseLineageRecord } from "./store/kinds/lineage/parser.js";
import type { Store } from "./store/contract.js";

/** Input rooted in the checkout this session enters. */
export interface ScratchReconcileInput { cwd: string; identity: string; store: Store }
/** Read-only scratch changes and findings suitable for the user-reference slot. */
export const ScratchReconcilePlanSchema = z.strictObject({
  moves: z.array(z.strictObject({ from: z.string(), to: z.string() })),
  advisories: z.array(z.strictObject({ path: z.string(), reason: z.enum(["ended", "missing", "occupied"]),
    text: z.string(), destination: z.string().optional() })),
});
/** A plan never contains deletion or merging of personal content. */
export type ScratchReconcilePlan = z.infer<typeof ScratchReconcilePlanSchema>;

/** Resolve each existing folder through the operational store without writing. */
export async function planScratchReconcile(input: ScratchReconcileInput): Promise<ScratchReconcilePlan> {
  const plan: ScratchReconcilePlan = { moves: [], advisories: [] };
  if (!input.store.capabilities.stateOffBranch) return plan;
  const userRoot = materializeArcPath(input.cwd, resolveArcPath({ kind: "user-root", identity: SlugSchema.parse(input.identity) }));
  const root = join(userRoot, "scratch", "work-unit");
  if (!await directoryExists(root)) return plan;
  const folders = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory())
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  for (const folder of folders) await planFolder(input.store, root, folder.name, plan);
  return plan;
}

/** Re-plan immediately before moving; directory rename refuses any nonempty destination. */
export async function applyScratchReconcile(input: ScratchReconcileInput): Promise<ScratchReconcilePlan> {
  const plan = await planScratchReconcile(input);
  for (const move of plan.moves) {
    if (await directoryExists(move.to) && (await readdir(move.to)).length > 0) {
      throw new Error(`Scratch destination ${move.to} now holds content. Combine ${move.from} and ${move.to} manually, then retry.`);
    }
    await rename(move.from, move.to);
  }
  return plan;
}
async function planFolder(store: Store, root: string, name: string, plan: ScratchReconcilePlan): Promise<void> {
  const path = join(root, name);
  const slug = SlugSchema.safeParse(name);
  const lookup = slug.success ? await store.lookup({ kind: "slug", slug: slug.data }) : null;
  if (lookup === null || (lookup.status === "refused" && lookup.refusal.code === "not-found")) {
    if (slug.success && await hasTerminalLineage(store, slug.data)) plan.advisories.push(endedAdvisory(path, name));
    else plan.advisories.push({ path, reason: "missing", text: `No work unit resolves from scratch folder ${path}. Inspect this folder; its contents remain yours.` });
    return;
  }
  if (lookup.status === "refused") throw new Error(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  const record = read.result;
  if (record.reference.kind !== "work-item/meta" || record.conflicts.length > 0) throw new Error(`Scratch folder ${path} resolves to an unresolved work-unit record. Repair the record, then retry.`);
  const fields = ParsedMetaRecordSchema.parse(record.fields);
  if (record.placement?.kind === "completed" || fields.state === "Shipped") {
    plan.advisories.push(endedAdvisory(path, record.reference.owner.name));
    return;
  }
  if (record.reference.owner.name === name) return;
  const destination = join(root, SlugSchema.parse(record.reference.owner.name));
  if (await directoryExists(destination) && (await readdir(destination)).length > 0) {
    plan.advisories.push({ path, destination, reason: "occupied", text: `Combine scratch folders ${path} and ${destination} manually; both contain personal content and remain in place.` });
    return;
  }
  plan.moves.push({ from: path, to: destination });
}
async function directoryExists(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Scratch path ${path} is not an ordinary directory. Inspect it before reconciling.`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function endedAdvisory(path: string, name: string): ScratchReconcilePlan["advisories"][number] {
  return { path, reason: "ended", text: `Work unit '${name}' has ended. Remove scratch folder ${path} once nothing in it is wanted.` };
}
async function hasTerminalLineage(store: Store, origin: string): Promise<boolean> {
  const lookup = await store.lookup({ kind: "lineage", origin });
  if (lookup.status === "refused") {
    if (lookup.refusal.code === "not-found") return false;
    throw new Error(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
  }
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  const lineage = parseLineageRecord(read.result.content);
  if (lineage === null || read.result.conflicts.length > 0) throw new Error(`Terminal lineage for '${origin}' is unresolved. Repair its record before reconciling scratch.`);
  return lineage.kind === "abandon" || lineage.kind === "decompose";
}
