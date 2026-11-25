/** Repository review records retain deferred decoding and stored owner validation. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, candidateFixture, boundaryFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { CandidateManagedRecordV1Schema } from "../../src/lib/work-unit/candidate-attestation.js";
import { parseIntegrationBoundaryLocus } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";

describe.each(["review/candidate", "review/integration-boundary"] as const)("repository %s codec", (kind) => {
  const make = (name = "example") => kind === "review/candidate" ? candidateFixture(name) : boundaryFixture(name);
  it("returns the existing whole parsed content and retains canonical writer bytes", async () => {
    const h = await trackedWriteFixture(), reference = h.reference(kind), value = make();
    const path = join(h.root, resolveArcPath({ kind: kind === "review/candidate" ? "candidate-record" : "integration-boundary-record",
      slug: reference.owner.name }));
    success(await h.store.write({ action: "put", reference, content: JSON.stringify(value), expected: null,
      provenance: { verb: "attest", lifecycleAction: "attest" } }));
    const record = success(await h.store.read({ reference }));
    expect(record.fields).toEqual(kind === "review/candidate" ? CandidateManagedRecordV1Schema.parse(value)
      : parseIntegrationBoundaryLocus(value));
    expect(record.content).toBe(await readFile(path, "utf8"));
  });
  it("refuses a stored record naming another work item and reads it after repair", async () => {
    const h = await trackedWriteFixture(), reference = h.reference(kind);
    const path = join(h.root, resolveArcPath({ kind: kind === "review/candidate" ? "candidate-record" : "integration-boundary-record",
      slug: reference.owner.name }));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(make("other")));
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "identity-mismatch", expected: reference, actual: { kind, owner: { name: "other" } } } });
    const repaired = JSON.stringify(make());
    await writeFile(path, repaired);
    expect(success(await h.store.read({ reference })).content).toBe(repaired);
  });
});
