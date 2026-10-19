/** Boundary access retains the filesystem contract while selecting explicit stores. */
import { expect, it } from "vitest";
import { canonicalize, digestBytes } from "../../../../../../../src/lib/kernel/canonical/canonical-json.js";
import { readSubmissionBoundary, readSubmissionBoundaryVersioned, writeSubmissionBoundary } from
  "../../../../../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { parseIntegrationBoundaryLocus } from
  "../../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryFixture } from "../../../../../../helpers/store/tracked-write-fixture.js";

import { SubmissionBoundaryVersionConflictError } from "../../../../../../../src/lib/work-unit/submission-boundary-store.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../../../../../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../../../../../helpers/store/model.js";
import { boundaryV2Fixture } from "../../../../../../fixtures/review-boundary.js";

it("reads the explicit filesystem boundary and exact byte version", async () => {
  const boundary = parseIntegrationBoundaryLocus(boundaryFixture());
  const content = canonicalize(boundary);
  const fs = { readFile: async () => content };
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", fs))
    .resolves.toEqual({ boundary, version: digestBytes(Buffer.from(content)) });
});

it("reads established boundary absence as null", async () => {
  const fs = { readFile: async (): Promise<string> => { throw Object.assign(new Error("Absent"), { code: "ENOENT" }); } };
  await expect(readSubmissionBoundary("/unavailable", "example", fs)).resolves.toBeNull();
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", fs)).resolves.toEqual({ boundary: null, version: null });
});


it.each(["direct", "options"])("preserves boundary writes and stale-writer refusal through %s filesystem input", async (mode) => {
  const files = new Map<string, string>();
  const fs = { readFile: async (path: string) => {
    const content = files.get(path);
    if (content === undefined) throw Object.assign(new Error("Absent"), { code: "ENOENT" });
    return content;
  }, writeFile: async (path: string, content: string) => { files.set(path, content); },
  withLock: async <T>(_path: string, operation: () => Promise<T>) => operation() };
  const input = mode === "direct" ? fs : { fs };
  const value = parseIntegrationBoundaryLocus(boundaryFixture());
  const writing = writeSubmissionBoundary("/unavailable", value, null, input);
  await expect(writing).resolves.toBe(".arc/system/.internal/candidates/example.boundary.json");
  const path = await writing;
  const version = digestBytes(Buffer.from(await fs.readFile(`/unavailable/${path}`)));
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", input))
    .resolves.toEqual({ boundary: value, version });
  await expect(writeSubmissionBoundary("/unavailable", value, null, input))
    .rejects.toBeInstanceOf(SubmissionBoundaryVersionConflictError);
  await expect(readSubmissionBoundary("/unavailable", "example", input)).resolves.toEqual(value);
  await expect(writeSubmissionBoundary("/unavailable", value, version, input)).resolves.toBe(path);
});

it.each(["malformed", "wrong-owner"])("rejects %s boundary content returned by the store", async (fault) => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  const reference = recordReferences["review/integration-boundary"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const stored = await h.seed(reference, JSON.stringify(boundaryV2Fixture()));
  const raw = h.store.state.records.get(recordKey(stored.reference));
  if (raw === undefined) throw new Error("Missing stored boundary fixture");
  raw.content = fault === "malformed" ? "{unreadable" : JSON.stringify(boundaryFixture("another"));
  const read = readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store });
  if (fault === "malformed") await expect(read).rejects.toBeInstanceOf(SyntaxError);
  else await expect(read).rejects.toThrow(/work unit does not match its path/u);
});
