/** Empty parsed metadata for advisory readers with unavailable field evidence. */

import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../../../active/meta-schema.js";

/** Construct an empty parsed record without treating empty bytes as metadata.
 * @returns A fresh parsed record with no field evidence.
 */
export function emptyParsedMetaRecord(): ParsedMetaRecord {
  return ParsedMetaRecordSchema.parse({
    state: null,
    owner: null,
    branch: null,
    workClass: null,
    priority: null,
    cohort: null,
    dependsOn: [],
    origin: null,
    design: [],
    taskList: null,
    reviewRubric: null,
    currentWorkflow: null,
    lastCompleted: null,
    nextTask: null,
    blockers: null,
    nextAction: null,
    prUrl: null,
    completed: null,
  });
}
