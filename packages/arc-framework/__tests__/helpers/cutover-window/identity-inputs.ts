/** Producer-aligned identity inputs and retirement for native window cases. */
import type { windowFixture } from "./fixture.js";
import { transientCommon } from "../store/import-transients.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import { ordinaryErrandTransform } from "../../../src/lib/errand/identity-transitions.js";
import { readTransientIdentitySnapshotAtRef } from "../../../src/lib/errand/identity-snapshot.js";
import { hashBlob, writeTreeCommit } from "../../../src/lib/errand/ref-tree.js";

/** Grooming and housekeep records that the import re-homes as claims. */
export function windowClaims(openedBaseHead: string) {
  return [
    TransientIdentityRecordSchema.parse({ ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha",
      members: ["alpha"], openedBaseHead, protection: "full", branch: "chore/groom-alpha", state: "open", changeRequest: null }),
    TransientIdentityRecordSchema.parse({ ...transientCommon, claimId: "2".repeat(32), kind: "errand", purpose: "housekeep-routing",
      slug: "housekeep", branch: "chore/housekeep", state: "open", savedHead: null, changeRequest: null }),
  ];
}

/** Apply the real abandon transform to a pinned fixture snapshot and keep its other records. */
export async function retireFixtureErrand(h: Awaited<ReturnType<typeof windowFixture>>, tip: string,
  options: { identity?: string; localTip?: string | null } = {}): Promise<string> {
  const identity = options.identity ?? "andrew", io = { exec: h.ports.exec, execInput: h.ports.execInput, identity };
  const snapshot = await readTransientIdentitySnapshotAtRef(io, tip);
  if (snapshot.kind !== "complete" || snapshot.diagnostics.length) throw new Error("The fixture snapshot is incomplete");
  const previous = snapshot.records.get("example");
  if (previous?.kind !== "errand" || previous.purpose !== "errand") throw new Error("The fixture Errand is absent");
  const retired = ordinaryErrandTransform({ kind: "retire", previous, reason: "abandon", authorization: "local" })(snapshot.records);
  if (retired.kind !== "applied") throw new Error("The fixture retirement was refused");
  const entries = new Map<string, string>();
  for (const [key, record] of retired.records) entries.set(key, await hashBlob(io.execInput, serializeTransientIdentityRecord(record)));
  return writeTreeCommit(io, entries, "Abandon the fixture Errand", [tip], options.localTip === undefined ? tip : options.localTip);
}
