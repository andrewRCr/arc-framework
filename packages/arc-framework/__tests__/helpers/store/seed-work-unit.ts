/** A work unit seeded into a temporary repository's ref store, as a spawned command reads it there. */
import type { MetaRenderOverrides } from "../../../src/lib/active/meta-reader.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { selectStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import type { WritePlacement } from "../../../src/lib/store/placement.js";
import { readProjectIdentityBinding } from "../../../src/lib/store/project-identity.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { boundWorkUnitSubject } from "./bound-checkout.js";
import { seedStore, type SeededRecord } from "./seed-store.js";

/** What a seeded work unit holds and where. */
export interface SeedWorkUnitOptions {
  /** The ARC identity the writes run as and the bound marker names. */
  readonly identity: string;
  /** The meta's fields; unset fields render as {@link makeMetaFixture} renders them. */
  readonly meta?: MetaRenderOverrides;
  /** The task list's content, when the work unit holds one. */
  readonly taskList?: string;
  /** The meta's lifecycle placement, active by default. */
  readonly placement?: WritePlacement;
  /** The branch linked as the work unit's own, as starting it links one. */
  readonly branch?: string;
  /** The checkout whose marker binds the work unit, none when omitted. */
  readonly bind?: string;
}

/** A seeded work unit's records. */
export interface SeededWorkUnit { readonly meta: SeededRecord; readonly taskList: SeededRecord | undefined }

/**
 * Seed one work unit's meta, and its task list when given, into a repository's ref store after `arc init` has minted
 * its project, linking its branch and binding a checkout's marker to it as starting the work unit does.
 * @param root - The repository's checkout.
 * @param slug - The work unit's slug.
 * @param options - The records' content, placement, branch, and the checkout to bind.
 * @returns The seeded records.
 */
export async function seedWorkUnit(root: string, slug: string, options: SeedWorkUnitOptions): Promise<SeededWorkUnit> {
  const owner = { type: "work-item", name: slug } as const;
  const links = options.branch === undefined ? undefined : { branches: [{
    repository: (await readProjectIdentityBinding(selectStore(createDefaultStorePorts({ checkoutRoot: root }), {}))).id,
    ref: `refs/heads/${options.branch}`, linkedAs: "created" as const, excluded: [],
  }] };
  const [meta, taskList] = await seedStore(root, SlugSchema.parse(options.identity), [
    { reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner }), content: makeMetaFixture(slug, options.meta),
      placement: options.placement ?? { kind: "active" }, ...(links === undefined ? {} : { links }) },
    ...(options.taskList === undefined ? [] : [{
      reference: RecordReferenceSchema.parse({ kind: "work-item/task-list", owner }), content: options.taskList }]),
  ]);
  if (meta === undefined) throw new Error("The work unit's meta was not seeded.");
  if (options.bind !== undefined) {
    await writeWorktreeMarker(options.bind, { spawnedByArc: false, createdFor: boundWorkUnitSubject(meta),
      spawningIdentity: options.identity, createdAt: "2026-10-24T00:00:00Z" });
  }
  return { meta, taskList };
}
