/** A native checked primary and its real projected metadata, ready for discovering a new file. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefFixture } from "../ref-fixture.js";
import { seed } from "../suite-tools.js";
import { seedProjection } from "./seeded-projection.js";
import { configureEngineCheckout } from "./engine-fixture.js";
import { createKindRegistry, RecordReferenceSchema } from "../../../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { makeMetaFixture } from "../../meta-fixture.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../bound-checkout.js";
import { resolveArcPath, type WorkUnitPlacement } from "../../../../src/lib/layout/index.js";
import { WorkUnitReadPlacementSchema, type WritePlacement } from "../../../../src/lib/store/placement.js";
import { workItemLayoutPlacement } from "../../../../src/lib/store/lifecycle-storage.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";

/** Choose only physical inputs that the real marker, layout resolver, and metadata renderer produce. */
export async function createAdoptionFixture(input: { placement?: WritePlacement; owner?: string; ownLayout?: "nested" | "flat" } = {}) {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS), f = await createRefFixture(registry);
  f.identity("andrew");
  const placement: WritePlacement = input.placement ?? { kind: "backlog", commitment: "planned" };
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    makeMetaFixture("alpha", { state: placement.kind === "completed" ? "Shipped" : placement.kind === "active" ? "Active" : "Planning",
      currentWorkflow: placement.kind === "completed" ? null : placement.kind === "active" ? "process-task-loop" : "draft-design",
      workClass: "Light", priority: "P1", owner: input.owner ?? "andrew" }), placement);
  await configureEngineCheckout(f.root);
  if (input.ownLayout !== undefined) {
    await writeWorktreeMarker(f.root, { spawnedByArc: false, createdFor: boundWorkUnitSubject(primary),
      spawningIdentity: "andrew", createdAt: new Date(0).toISOString() });
    await mkdir(join(f.root, ".arc/system"), { recursive: true });
    await writeFile(join(f.root, ".arc/system/arc-config.yml"), `layout.active: ${input.ownLayout}\n`);
  }
  const physical: WorkUnitPlacement = placement.kind === "active" ? { kind: "active", scope: { kind: "project",
    location: input.ownLayout === undefined ? { kind: "another" } : { kind: "own", claim: SlugSchema.parse("alpha"), layoutActive: input.ownLayout } } }
    : await workItemLayoutPlacement(f.root, "alpha", WorkUnitReadPlacementSchema.parse(primary.placement), null);
  const container = { kind: "work-unit-container", slug: SlugSchema.parse("alpha"), placement: physical } as const;
  const folder = resolveArcPath(container), metaPath = resolveArcPath({ kind: "work-unit-artifact", slug: container.slug, placement: physical, artifact: "meta" });
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [{ reference: primary.reference, path: metaPath }] });
  return { f, registry, primary, folder, projected };
}

/** Project an active Errand through its exact ready claim and its description's real address. */
export async function createErrandAdoptionFixture() {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS), f = await createRefFixture(registry);
  f.identity("andrew");
  const claimId = "a".repeat(32), slug = SlugSchema.parse("alpha");
  const primary = await seed(f, recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })),
    JSON.stringify(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug, claimId,
      createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", intent: "A bounded correction", branch: "chore/alpha",
      owner: "andrew", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null })), { kind: "active" });
  const description = await seed(f, recordReferences["work-item/description"](primary.reference.owner), "## Description\n\n");
  await configureEngineCheckout(f.root);
  await writeWorktreeMarker(f.root, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: { kind: "errand", slug, claimId }, provisioning: "ready" });
  const placement = { kind: "active", scope: { kind: "project", location: { kind: "own", claim: slug, layoutActive: "nested" } } } as const;
  const folder = resolveArcPath({ kind: "work-unit-container", slug, placement });
  const projected = await seedProjection({ store: f.store, checkout: f.root,
    files: [{ reference: description.reference, path: resolveArcPath({ kind: "errand-description", slug, placement }) }] });
  return { f, primary, folder, projected };
}
