/** Advisory registered rules over immutable local tips and a prepared published-state merge. */

import type { ConflictRecordValue } from "../conflict.js";
import type { RecordReference } from "../identity.js";
import type { KindDefinition } from "../registry.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import { createRefWriteViews } from "./write-views.js";

/** One kind's before and after record, with absence represented by omission. */
export interface SyncCheckRecord { reference: RecordReference; prior?: ConflictRecordValue; next?: ConflictRecordValue }

/** Report every broken rule without changing the prepared tree or refusing its publication. */
export async function observeSyncChecks(context: RefBackendContext, tips: ReadonlyMap<string, string>, ref: string,
  group: RefWriteGroup, records: readonly SyncCheckRecord[]): Promise<PullNotice[]> {
  const { before, after } = createRefWriteViews(context, tips, new Map([[ref, group]]));
  const notices: PullNotice[] = [];
  for (const { reference, prior, next } of records) {
    const definition = context.registry[reference.kind];
    if (!definition.check) continue;
    const previous = checkSide(definition, prior), selected = checkSide(definition, next);
    const rules = await definition.check({ reference, before, after, writer: { kind: "verb", verb: "sync" },
      ...previous ? { prior: previous } : {},
      ...selected ? { next: { content: selected.content, fields: selected.fields } } : {},
    });
    notices.push(...rules.map((rule) => ({ kind: "rule-broken" as const, reference, ...rule })));
  }
  return notices;
}

function checkSide(definition: KindDefinition, value: ConflictRecordValue | undefined): { content: string; fields?: unknown } | undefined {
  if (!value) return undefined;
  const parsed = definition.parser?.(value.content);
  return { content: value.content, ...parsed?.success ? { fields: parsed.data } : {} };
}
