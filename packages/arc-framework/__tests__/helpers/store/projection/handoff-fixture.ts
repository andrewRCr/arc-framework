/** Two real stored records and a staged arrival sharing one projected pathname. */
import { join } from "node:path";
import { createWriteBackFixture } from "./write-back-fixture.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { projectionEntryForRecord } from "../../../../src/lib/store/projection/materialization-file.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";

/** Produce the same arriving basis that an exclusive installation journals before linking. */
export async function createHandoffFixture(extension = "md") {
  const h = await createWriteBackFixture({ path: `.arc/user/test-user/scratch/shared.${extension}` });
  const reference = RecordReferenceSchema.parse({ ...h.entry.reference, key: `scratch/arrival.${extension}` });
  const result = await h.store.write({ action: "put", reference, expected: null, content: "arriving bytes\n",
    provenance: { verb: "seed", lifecycleAction: "seed" } });
  if (result.status !== "ok") throw new Error("Arrival seed refused");
  const read = await h.store.read({ reference: result.result.reference });
  if (read.status !== "ok") throw new Error("Arrival read refused");
  const record = read.result;
  const staged = await stageRecordFile({ ...h.context, checkout: h.checkout, path: h.path, record, replacing: h.entry.base.blob });
  if (staged.status !== "ok") throw new Error("Arrival staging refused");
  const arrival = { ...projectionEntryForRecord(record, h.path, "sha1"), stat: await readStat(join(h.checkout, staged.result.location)),
    written: staged.result.written, base: staged.result.base };
  const entry = { ...h.entry, pending: true, withheld: true, handoff: arrival };
  return { ...h, arrival, record, staged: staged.result, journal: { ...h.index, entries: { [h.path]: entry } },
    request: { ...h.request, entry }, root: { checkout: h.checkout, location: h.location, context: h.context,
      writable: () => true, blockedByLink: () => null } };
}
