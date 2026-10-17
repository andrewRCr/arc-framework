/** Canonical per-record format coordinates within a containing state ref. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RecordReference } from "../identity.js";

/** Include an origin UID where singleton lineage records share the registry ref. */
export function refFormatKey(reference: RecordReference): string {
  const { kind, key, owner } = reference;
  const ownerUid = kind === "lineage/transition" && owner.type === "work-item" ? owner.uid : undefined;
  if (kind === "lineage/transition" && ownerUid === undefined) throw new Error("A lineage format coordinate requires a resolved origin UID");
  return canonicalize({ kind, ...(key === undefined ? {} : { key }), ...(ownerUid === undefined ? {} : { ownerUid }) });
}
