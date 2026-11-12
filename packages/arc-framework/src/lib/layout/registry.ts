/** Composed schema discovery for the ARC layout subsystem. */

import { createKernelRegistry, type KernelRegistry } from "../kernel/index.js";
import {
  ArcLayoutAddressSchema,
  ArcPlacementTierSchema,
  ArchiveQuarterSchema,
  ArchiveSequenceSchema,
  ProjectDocumentKindSchema,
  ProcedureFamilySchema,
  TemplateOutputPathSchema,
  TemplateRelativePathSchema,
  WorkUnitArtifactKindSchema,
  WorkUnitPlacementSchema,
} from "./schema.js";

/** Stable identities for the public layout schema roots. */
export const LAYOUT_SCHEMA_IDS = {
  address: "layout-address",
  archiveQuarter: "layout-archive-quarter",
  archiveSequence: "layout-archive-sequence",
  artifactKind: "layout-artifact-kind",
  placementTier: "layout-placement-tier",
  projectDocumentKind: "layout-project-document-kind",
  procedureFamily: "layout-procedure-family",
  templateOutputPath: "layout-template-output-path",
  templateRelativePath: "layout-template-relative-path",
  workUnitPlacement: "layout-work-unit-placement",
} as const;

const STRICT_CURRENT_V1 = { version: 1, migrationPosture: "strict-current" } as const;

/**
 * Create a fresh kernel registry extended with the public layout roots.
 *
 * @returns Isolated registry containing kernel vocabulary and layout schemas
 */
export function createLayoutRegistry(): KernelRegistry {
  const registry = createKernelRegistry();
  const roots = [
    [LAYOUT_SCHEMA_IDS.address, ArcLayoutAddressSchema],
    [LAYOUT_SCHEMA_IDS.archiveQuarter, ArchiveQuarterSchema],
    [LAYOUT_SCHEMA_IDS.archiveSequence, ArchiveSequenceSchema],
    [LAYOUT_SCHEMA_IDS.artifactKind, WorkUnitArtifactKindSchema],
    [LAYOUT_SCHEMA_IDS.placementTier, ArcPlacementTierSchema],
    [LAYOUT_SCHEMA_IDS.projectDocumentKind, ProjectDocumentKindSchema],
    [LAYOUT_SCHEMA_IDS.procedureFamily, ProcedureFamilySchema],
    [LAYOUT_SCHEMA_IDS.templateOutputPath, TemplateOutputPathSchema],
    [LAYOUT_SCHEMA_IDS.templateRelativePath, TemplateRelativePathSchema],
    [LAYOUT_SCHEMA_IDS.workUnitPlacement, WorkUnitPlacementSchema],
  ] as const;

  for (const [id, schema] of roots) registry.register(schema, { id, ...STRICT_CURRENT_V1 });
  return registry;
}
