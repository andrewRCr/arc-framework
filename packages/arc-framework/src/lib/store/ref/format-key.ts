/** Canonical per-record format coordinates within a containing state ref. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RecordReference } from "../identity.js";

/** Include an origin UID where singleton lineage records share the registry ref. */
export function refFormatKey(reference: RecordReference): string {
  const { kind, key, owner } = reference;
  const ownerUid = kind === "lineage/transition" && owner.type === "work-item" ? owner.uid : undefined;
  if (kind === "lineage/transition" && ownerUid === undefined) throw new Error("A lineage format coordinate requires a resolved origin UID");
  const coordinate = {
    ...(key === undefined ? {} : { key: typeof key === "string" ? key : { activity: key.activity, number: key.number } }),
    kind, ...(ownerUid === undefined ? {} : { ownerUid }),
  };
  // Keep scalar validation, while retaining the exact admitted spelling in the coordinate.
  canonicalize(coordinate);
  return JSON.stringify(coordinate).replace(/[\u0080-\u{10ffff}]/gu,
    point => point.split("").map(unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""));
}
