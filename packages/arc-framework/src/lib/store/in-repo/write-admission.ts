/** Tracked work-unit writes follow the same selected copy as reads and lifecycle listings. */
import { admitTrackedOwner } from "./tracked-identity.js";
import { parseMetaProjectionRecord } from "../../active/meta-reader.js";
import { resolveArcPath } from "../../layout/index.js";
import { SlugSchema } from "../../kernel/schema/slug.js";
import type { ReadPlacement, WritePlacement } from "../placement.js";
import type { WriteInput } from "../write.js";
import type { InRepoContext } from "./context.js";
import { heldMetaSources, selectMeta, type MetaSource } from "./meta.js";
import { recordPath } from "./paths.js";
import { notFound, refuse, unsupported } from "./refusals.js";
import { malformedWrite } from "./write-codec.js";

/** Resolve a creation's physical placement without validating unrelated semantic meta fields.
 * @param input - A new primary meta and its requested placement.
 * @returns The proposed writable source used by its companion writes in the same batch.
 */
export function creationMeta(input: WriteInput): MetaSource {
  if (input.action !== "put" || input.placement === undefined) throw new Error("Meta creation requires content and placement");
  if (input.placement.kind === "completed") return unsupported("completed-create", "Completed creation requires an assigned archive sequence.", "Use arc archive to complete an existing work unit.");
  let fields;
  try { fields = parseMetaProjectionRecord(input.content); }
  catch (error) { return malformedWrite(input.reference, `meta field projection: ${error instanceof Error ? error.message : "Unreadable metadata"}`); }
  const raw = fields.Cohort?.trim() ?? "";
  const segments = ["", "[none]", "—"].includes(raw) ? [] : raw.split("/");
  if (segments.length > 2 || segments.some((segment) => !SlugSchema.safeParse(segment).success)) return malformedWrite(input.reference, `Cohort: invalid path ${raw}`);
  const placement = input.placement.kind === "active" ? { kind: "active" as const, scope: { kind: "project" as const } }
    : { ...input.placement, cohort: segments.map((segment) => SlugSchema.parse(segment)) };
  const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: input.reference.owner.name, placement });
  return { slug: input.reference.owner.name, path, content: null,
    location: input.placement.kind === "active" ? "active" : input.placement.commitment, placement: input.placement, writable: true };
}

/** Refuse capabilities that the interim tracked layout cannot serve unchanged.
 * @param context - Registry defining each role's physical substrate.
 * @param input - Caller mutation.
 * @returns Nothing for an eligible tracked request.
 */
export function admitTrackedRole(context: InRepoContext, input: WriteInput): void {
  admitTrackedOwner(input.reference.owner);
  if (input.action === "put" && input.links !== undefined) unsupported("links-write", "Tracked records store no links value.", "Use today's lifecycle or code-link verb until links are stored.");
  if (context.registry[input.reference.kind].inRepo.substrate !== "tracked") unsupported("unhomed-kind", "This kind has no home before the flip.", "Use the backend that serves this record kind.");
}

/** Select and admit the checkout-local path for an update, deletion or creation.
 * @param context - Read-selection and filesystem dependencies.
 * @param input - Mutation naming one tracked record.
 * @param creations - New metas admitted by the same batch, keyed by owner slug.
 * @returns The repository-relative path whose actual bytes must be checked.
 */
export async function admittedWritePath(context: InRepoContext, input: WriteInput, creations: ReadonlyMap<string, MetaSource>): Promise<string> {
  admitTrackedRole(context, input);
  const reference = input.reference;
  if (!reference.kind.startsWith("work-item/")) return recordPath(context, reference);
  const meta = await writeMeta(context, input, creations);
  if (meta === undefined) return notFound(reference, "Create the work unit's meta with this record in one batch, then retry.");
  requireWritable(context, meta);
  if (reference.kind === "work-item/meta" && input.action === "put" && meta.content !== null && meta.placement !== undefined
    && !samePlacement(meta.placement, input.placement)) return unsupported("placement-move", "The write names a different placement.", "Use the lifecycle verb (promote, demote, park, resume or archive) to move the work unit.");
  return recordPath(context, reference, meta);
}

async function writeMeta(context: InRepoContext, input: WriteInput, creations: ReadonlyMap<string, MetaSource>): Promise<MetaSource | undefined> {
  const slug = input.reference.owner.name;
  if (input.reference.kind === "work-item/meta" && input.action === "put" && input.expected === null) {
    return (await heldMetaSources(context)).find((source) => source.slug === slug) ?? creations.get(slug);
  }
  return creations.get(slug) ?? await selectMeta(context, slug);
}
function requireWritable(context: InRepoContext, meta: MetaSource): void {
  if (meta.writable) return;
  const checkout = meta.checkout ?? meta.revision ?? context.ports.checkoutRoot;
  const movedHere = checkout === context.ports.checkoutRoot;
  refuse({ code: "checkout-not-writable", class: "recoverable", checkout,
    condition: "This checkout holds no meta copy agreeing with the selected record.",
    remedy: { text: movedHere ? "Commit this work unit's placement move, then retry the write."
      : `Write from ${checkout}, checking out its branch if no worktree holds it.` } });
}
function samePlacement(current: ReadPlacement, requested?: WritePlacement): boolean {
  if (current.kind === "active" && requested?.kind === "active") return true;
  if (current.kind === "backlog" && requested?.kind === "backlog") return current.commitment === requested.commitment;
  if (current.kind === "completed" && requested?.kind === "completed") return current.quarter === requested.quarter;
  return false;
}
