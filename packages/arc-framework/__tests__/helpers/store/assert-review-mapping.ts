/** Production codec and admission checks over a complete mapped review set. */
import { expect } from "vitest";
import { createKindRegistry } from "../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";
import { StoreRecordSchema, type StoreRecord } from "../../../src/lib/store/index.js";
import type { ReviewMappingResult } from "../../../src/lib/store/kinds/review/mapping-types.js";
import { ruleView } from "./rule-view.js";

export async function assertReviewMapping(result: ReviewMappingResult): Promise<void> {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const decoded = result.records.map(({ reference, contents }) => ({ reference, versions: contents.map((content) => {
    const parser = registry[reference.kind].parser;
    if (parser === null) throw new Error(`No parser for ${reference.kind}`);
    const parsed = parser(content);
    expect(parsed, `${reference.kind}/${String(reference.key)}`).toMatchObject({ success: true });
    if (!parsed.success) throw new Error(parsed.error);
    return StoreRecordSchema.parse({ reference, content, fields: parsed.data, version: "mapped-version",
      formatVersion: 1, conflicts: [], placement: { kind: "active" } });
  }) }));
  const final: StoreRecord[] = decoded.map(({ versions }) => {
    const last = versions.at(-1);
    if (last === undefined) throw new Error("Mapped record has no content");
    return last;
  });
  const after = ruleView(final);
  for (const { reference, versions } of decoded) {
    let prior: StoreRecord | undefined;
    for (const next of versions) {
      const check = registry[reference.kind].check;
      if (check === null) throw new Error(`No write check for ${reference.kind}`);
      expect(await check({ reference, prior, next: { content: next.content, fields: next.fields },
        writer: { kind: "verb", verb: "review" }, before: ruleView(prior === undefined ? [] : [prior]), after }),
      `${reference.kind}/${String(reference.key)}`).toEqual([]);
      prior = next;
    }
  }
}
