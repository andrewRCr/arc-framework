/** Public pure cohort content operations. */
export {
  parseCohortDocument, ParsedCohortDocumentSchema, type ParsedCohortDocument, type CohortDocumentParseResult,
} from "./parser.js";
export { writeCohortDocument, type CohortMemberSection } from "./creation-writer.js";
export { rewriteCohortMemberHeading } from "./member-heading-writer.js";
export { rewriteCohortHeading, writeCohortParent } from "./identity-writers.js";
export { rewriteCohortFilenameReferences } from "./filename-reference-writer.js";
export { reportOrphanCohortMemberSections } from "./member-section-report.js";
export { writeCohortFanout, type CohortFanoutWriteResult } from "./fanout-writer.js";
