/** A refused current Candidate cannot become an earlier accepted revision during native import. */
import { expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { importFixture } from "../helpers/store/import-fixture.js";
import { createRefStore, recordReferences, OwnerIdentitySchema } from "../../src/lib/store/index.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, createCandidateSubjectSnapshot,
  serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../../src/lib/work-unit/candidate-record-store.js";
import { success } from "../helpers/store/suite-tools.js";

function candidate(supersedes?: `sha256:${string}`): string {
  const subject = createCandidateSubjectSnapshot([{ path: "src/main.ts", mode: "100644", digest: canonicalDigest({ code: 1 }),
    treatment: "reviewable" }]);
  const attestation = createCandidateAttestation({ workUnit: "alpha", subject, baseRevision: "a".repeat(40),
    attestedBy: "andrew", attestedAt: "2026-11-01T12:00:00Z", verificationEvidenceRef: "verification://root", supersedes });
  return serializeCandidateManagedRecord(CandidateManagedRecordV1Schema.parse({ schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", attestation, subject, transitions: [], lineageAttestations: [] }));
}

it.each(["malformed", "supersession"] as const)("withholds a %s current Candidate through native import and repaired retry", async reason => {
  const h = await importFixture();
  const path = resolveCandidateRecordRelativePath("alpha"), accepted = candidate();
  await writeFile(join(h.root, path), accepted);
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Retain accepted Candidate"]);
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  await h.git("git", ["checkout", "feat/alpha"]);
  const refused = reason === "malformed" ? "{}\n" : candidate(canonicalDigest({ absent: "root" }));
  await writeFile(join(h.root, path), refused);
  const trialResult = await h.migrateCommand(true);
  if (trialResult.status !== "ok") throw new Error(JSON.stringify(trialResult));
  const trial = trialResult.result;
  const sources = trial.reviewMapping.filter(({ source }) => source === path || source.startsWith(`${path}@`));
  expect(sources.length).toBeGreaterThan(1);
  expect(sources.every(({ outcome, records }) => outcome === "left-behind" && records.length === 0)).toBe(true);
  expect(await h.migrateCommand()).toMatchObject({ status: "ok" });
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" }));
  expect(await createRefStore(h.ports).read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(h.root, path), "utf8")).toBe(refused);

  const repaired = await importFixture();
  await writeFile(join(repaired.root, path), accepted);
  await repaired.git("git", ["add", ".arc"]);
  await repaired.git("git", ["commit", "-m", "Repair Candidate source"]);
  await repaired.git("git", ["update-ref", "refs/heads/feat/alpha", (await repaired.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  await repaired.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(repaired.root, path), refused);
  const repairTrialResult = await repaired.migrateCommand(true);
  if (repairTrialResult.status !== "ok") throw new Error(JSON.stringify(repairTrialResult));
  const repairTrial = repairTrialResult.result;
  expect(repairTrial.reviewMapping.filter(({ source }) => source === path || source.startsWith(`${path}@`))
    .every(({ outcome }) => outcome === "left-behind")).toBe(true);
  await writeFile(join(repaired.root, path), accepted);
  expect(await repaired.migrateCommand()).toMatchObject({ status: "ok" });
  expect(success(await createRefStore(repaired.ports).read({ reference })).content).toBe(accepted);
}, 60_000);
