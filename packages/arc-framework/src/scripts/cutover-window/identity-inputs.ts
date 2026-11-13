/** Refuse identity inputs the import would carry across incorrectly or leave behind. */
import type { WindowTransientInput } from "./transients.js";
import type { WindowFinding } from "./result.js";

/** Retire every ordinary Errand before the window, preserving side and ref attribution. */
export function windowErrandInputFindings(inputs: readonly WindowTransientInput[]): WindowFinding[] {
  return inputs.flatMap(input => input.records.filter(record => record.reference.kind === "work-item/record")
    .map(record => ({ subject: `Errand ${record.reference.owner.name}`,
      condition: `An Errand record remains in ${input.side} ${record.ref}.`,
      remedy: "Close the Errand and land its branch, or abandon it, then retry check." })));
}

/** Refuse origin identity refs the import cannot retire from its local input. */
export function windowIdentityTipFindings(refs: { local: Readonly<Record<string, string>>; origin: Readonly<Record<string, string>> }): WindowFinding[] {
  return Object.entries(refs.origin).filter(([ref, tip]) => /^refs\/arc\/user\/[^/]+\/errands$/u.test(ref) && refs.local[ref] !== tip)
    .map(([ref, tip]) => ({ subject: ref, condition: `Identity ref differs: local ${refs.local[ref] ?? "absent"}; origin ${tip}.`,
      remedy: "Fetch origin into an absent or ancestral local ref, or push an ancestral origin forward; leave diverged tips to the Owner, then retry check." }));
}

/** Refuse claims the configured identity cannot publish during the import. */
export function windowForeignClaimFindings(inputs: readonly WindowTransientInput[], identity: string | null): WindowFinding[] {
  return inputs.flatMap(input => input.records.filter(record => record.reference.owner.type === "person"
    && record.reference.owner.name !== identity).map(record => ({ subject: `identity ${record.reference.owner.name}`,
      condition: `${record.reference.kind} claim ${JSON.stringify(record.reference.key)} remains in ${input.side} ${record.ref}, outside configured identity ${identity ?? "(none)"}.`,
      remedy: `Have ${record.reference.owner.name} close this claim before the window, then retry check.` })));
}
