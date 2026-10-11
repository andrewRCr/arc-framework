/** Former-name protection for work-item creation and rename. */
import { sameOwner } from "../../identity.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { brokenRule } from "../rule-support.js";
import { acquiresSlug } from "./slug-acquisition.js";

/** Check that a newly acquired name is not another generation's former name.
 * @param input - Proposed write and both read views.
 * @returns Every former-slug violation, including unavailable identity evidence.
 */
export async function checkFormerSlug(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const rule = "work-item.former-slug";
  const remedy = "Choose an unused slug or restore the identity lookup, then retry the write.";
  const acquired = await acquiresSlug(input);
  if (acquired.status !== "known") return [brokenRule(rule, acquired.status === "unavailable" ? acquired.condition : "Name acquisition is unavailable.", remedy)];
  if (!acquired.value) return [];
  const result = await input.before.lookup({ kind: "slug", slug: input.reference.owner.name });
  if (result.status === "refused") return result.refusal.code === "not-found" ? []
    : [brokenRule(rule, `Cannot resolve the prior slug: ${result.refusal.condition}`, remedy)];
  const holder = result.result.reference.owner;
  return holder.name !== input.reference.owner.name && !sameOwner(holder, input.reference.owner)
    ? [brokenRule(rule, `Slug \`${input.reference.owner.name}\` is a former slug of \`${holder.name}\`.`, remedy)] : [];
}
