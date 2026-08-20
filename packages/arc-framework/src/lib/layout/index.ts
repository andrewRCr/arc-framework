/** Public API for semantic ARC layout projection and materialization. */

export { LayoutError } from "./errors.js";
export type { LayoutErrorCode } from "./errors.js";
export {
  identifyWorkUnitArtifactPath,
  isProjectDocumentPath,
  type IdentifiedWorkUnitArtifact,
} from "./identification.js";
export { materializeArcPath } from "./materialization.js";
export { LAYOUT_SCHEMA_IDS, createLayoutRegistry } from "./registry.js";
export { resolveArcPath } from "./projection.js";
export {
  TEMPLATE_BINDING_SUFFIX,
  resolveTemplateOutputBindings,
  resolveTemplateOutputPath,
  type TemplateOutputBinding,
} from "./template-output.js";
export {
  ArcLayoutAddressSchema,
  ArcPlacementTierSchema,
  ArchiveQuarterSchema,
  ArchiveSequenceSchema,
  ProcedureFamilySchema,
  ProjectDocumentKindSchema,
  TemplateOutputPathSchema,
  TemplateRelativePathSchema,
  WorkUnitArtifactKindSchema,
  WorkUnitPlacementSchema,
} from "./schema.js";
export type {
  ArcLayoutAddress,
  ArcPlacementTier,
  ArchiveQuarter,
  ArchiveSequence,
  ProcedureFamily,
  ProjectDocumentKind,
  TemplateOutputPath,
  TemplateRelativePath,
  WorkUnitArtifactKind,
  WorkUnitPlacement,
} from "./schema.js";
