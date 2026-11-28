/** Store read failures observed by the Candidate lineage suite. */
import { expect, it, onTestFinished } from "vitest";

import { canonicalize, SlugSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { candidateRecordFixture } from "../fixtures/review-candidate.js";
import { readCandidateVersioned } from "../helpers/candidate-lineage-suite.js";
import { createRefTestRepository, removeLooseObject } from "../helpers/store/ref-plant.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

it("rejects a Candidate lineage read when the stored Candidate's blob is unavailable", async () => {
  const { root, exec, cleanup } = await createRefTestRepository();
  onTestFinished(cleanup);
  await exec("git", ["config", "arc.identity", "test-user"]);
  const { record } = candidateRecordFixture();
  const { records: [candidate] } = await seedWorkUnit(root, "example", {
    identity: "test-user", records: [{ kind: "review/candidate", content: canonicalize(record) }],
  });
  if (!candidate) throw new Error("Expected a seeded Candidate");
  await expect(readCandidateVersioned(root)).resolves.toEqual({ record, version: candidate.version });

  const { ref, path } = expandStoredPath(candidate.reference);
  const { stdout } = await exec("git", ["rev-parse", `${ref}:${path}`]);
  await removeLooseObject(root, stdout.trim());
  await expect(readStoreRecord(root, SlugSchema.parse("test-user"), candidate.reference))
    .rejects.toThrow(/state-unresolvable/);
  await expect(readCandidateVersioned(root)).rejects.toMatchObject({ refusal: { code: "state-unresolvable" } });
});
