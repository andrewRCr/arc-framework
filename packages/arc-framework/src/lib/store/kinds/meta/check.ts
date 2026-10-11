/** Complete pure metadata rule catalog over a caller's before and after views. */
import type { EntryListConfig } from "../../concurrency/entries.js";
import { checkFormerSlug, checkSlugEdges } from "../work-item/index.js";
import { checkMetaVerbOwnedField } from "./authority-rules.js";
import { checkMetaFieldBlock, checkMetaDurableFields } from "./shape-rules.js";
import { checkMetaDependsOn, checkMetaDesignEntry, checkMetaCohort } from "./reference-rules.js";
import { checkMetaStage, checkMetaPrepareTasks } from "./lifecycle-rules.js";
import { checkMetaInboundHeld } from "./inbound-held-rule.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Run every metadata and shared work-item rule.
 * @param input - Proposed metadata write and both complete views.
 * @param inboundGrammar - Declared entry grammar, absent until inbound declares one.
 * @returns Every broken rule, or an empty result admitting the write.
 */
export async function checkMetaRecord(input: WriteCheckInput, inboundGrammar?: EntryListConfig): Promise<readonly BrokenRule[]> {
  const observed = await Promise.all([
    checkMetaDependsOn(input), checkMetaDesignEntry(input), checkMetaCohort(input),
    checkMetaStage(input), checkMetaPrepareTasks(input), checkMetaInboundHeld(input, inboundGrammar),
    checkFormerSlug(input), checkSlugEdges(input),
  ]);
  return [...checkMetaVerbOwnedField(input), ...checkMetaFieldBlock(input), ...checkMetaDurableFields(input), ...observed.flat()];
}
