/** Publication target selection carries former names into current-name evidence readers. */
import { expect, it, onTestFinished } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePublicationTarget } from "../../../src/handlers/lifecycle.js";
import { readCandidateRecordVersioned, writeCandidateRecord } from "../../../src/lib/work-unit/candidate-record-store.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";

it.each(["publish", "reopen"] as const)("%s carries an explicit former name into current Candidate evidence", async (verb) => {
  const h = createLifecycleHarness(); const prior = await h.seedMeta("former");
  lifecycleSuccess(await h.store.write({ action: "put", reference: { ...prior.reference,
    owner: { ...prior.reference.owner, name: SlugSchema.parse("current") } }, expected: prior.version,
    content: prior.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const cwd = await mkdtemp(join(tmpdir(), "arc-publication-target-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const candidate = candidateFixture("current"); await writeCandidateRecord(cwd, "current", candidate, null);
  const selected = await resolvePublicationTarget({ cwd, store: h.store }, verb, "former");
  expect(selected).toBe("current");
  expect((await readCandidateRecordVersioned(cwd, selected!)).record).toEqual(candidate);
});
