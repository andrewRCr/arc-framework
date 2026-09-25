/** Provider-neutral path treatment for evidence applicability. */

import { z } from "zod";

import { SlugSchema } from "../kernel/schema/slug.js";
import {
  ProjectDocumentKindSchema,
  identifyWorkUnitArtifactPath,
  resolveArcPath,
  type ProjectDocumentKind,
} from "../layout/index.js";
import { artifactMatcher } from "../work-unit/mutators/relocate-artifacts.js";

export const PathTreatmentSchema = z.enum(["reviewable", "evidence-neutral", "regenerable"]);
export type PathTreatment = z.infer<typeof PathTreatmentSchema>;

export interface PathTreatmentContext {
  readonly workUnit?: string;
  readonly projectionPaths?: ReadonlySet<string>;
}

const PROJECT_DOCUMENT_TREATMENT = {
  roadmap: "regenerable",
} as const satisfies Record<ProjectDocumentKind, Exclude<PathTreatment, "reviewable">>;

const PROJECT_DOCUMENTS = new Map<string, Exclude<PathTreatment, "reviewable">>(
  ProjectDocumentKindSchema.options.map((document) => [
    resolveArcPath({ kind: "project-document", document }),
    PROJECT_DOCUMENT_TREATMENT[document],
  ]),
);

function isWorkUnitArtifactOrCompanion(path: string, workUnit: string): boolean {
  const identified = identifyWorkUnitArtifactPath(path);
  if (identified?.slug === workUnit) return true;

  const separator = path.lastIndexOf("/");
  const directory = separator < 0 ? "" : path.slice(0, separator + 1);
  const basename = path.slice(separator + 1);
  if (!artifactMatcher(workUnit).test(basename)) return false;
  return identifyWorkUnitArtifactPath(`${directory}notes-${workUnit}.md`)?.slug === workUnit;
}

/** Classify one repository-relative path for evidence applicability. */
export function classifyPathTreatment(
  path: string,
  context: PathTreatmentContext = {},
): PathTreatment {
  const projectDocument = PROJECT_DOCUMENTS.get(path);
  if (projectDocument !== undefined) return projectDocument;

  if (context.projectionPaths?.has(path) === true) return "evidence-neutral";
  if (context.workUnit !== undefined) {
    const workUnit = SlugSchema.parse(context.workUnit);
    if (isWorkUnitArtifactOrCompanion(path, workUnit)) return "evidence-neutral";
  }
  return "reviewable";
}
