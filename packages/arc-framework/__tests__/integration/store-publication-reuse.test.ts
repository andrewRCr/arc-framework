/** Publication and withdrawal retain their selected generation through Candidate and Git boundaries. */
import { expect, it } from "vitest";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaCandidate } from "../../src/lib/store/kinds/meta/writers.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { CandidatePublishReadyBoundarySchema } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";

it.each([false, true])("publishes the live generation with real Candidate evidence, former=%s", async former => {
  const f = await lifecycleReuseFixture(former);
  const branch = `feat/${f.name}`;
  await f.exec("git", ["switch", "-c", branch]);
  await writeFile(join(f.cwd, "implementation.ts"), "export const value = true;\n");
  await f.exec("git", ["add", "implementation.ts"]); await f.exec("git", ["commit", "-m", "implementation"]);
  const target = await collectCandidateSubjectTarget({ cwd: f.cwd, name: f.name, baseBranch: "main", exec: f.exec });
  const attestation = createCandidateAttestation({ workUnit: f.name, subject: target.subject, baseRevision: target.revision,
    attestedBy: "test-user", attestedAt: "2026-10-24T00:00:00Z", verificationEvidenceRef: "test://publication-reuse" });
  await writeCandidateRecord(f.cwd, f.name, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", attestation,
    subject: target.subject, transitions: [], lineageAttestations: [] }, null);
  await writeSubmissionBoundary(f.cwd, CandidatePublishReadyBoundarySchema.parse({ schemaVersion: 1, mode: "pre-publication-review",
    workUnit: f.name, candidateId: attestation.candidateId, candidateSubjectDigest: target.subject.subjectDigest,
    locus: "candidate-publish-ready", standardLaneOwnerVersion: 0, policy: null, reservation: null, terminus: null,
    deliveryReviewTermini: [], nextAction: { kind: "publish-candidate", command: `arc publish ${f.name} --json`, interactionText: "Publish" } }), null);
  lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { content: writeMetaCandidate(f.live.content, attestation.candidateId),
    links: { branches: [{ repository: f.repository, ref: branch, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "fixture", lifecycleAction: "attest" } }));
  const result = await repairCli(f, ["publish", "example", "--json"], { store: f.store });
  expect(lifecycleSuccess(await f.store.read({ reference: f.archived.reference }))).toEqual(f.archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "published" });
  expect(lifecycleSuccess(await f.store.read({ reference: f.live.reference })).fields).toMatchObject({ state: "Integrating" });
}, 60_000);

it.each([false, true])("reopens the live generation and withdraws its logical request, former=%s", async former => {
  const f = await lifecycleReuseFixture(former, { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: `tasks-${former ? "current" : "example"}.md` });
  const branch = `feat/${f.name}`;
  await f.exec("git", ["switch", "-c", branch]);
  lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { links: { branches: [{ repository: f.repository, ref: branch, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "fixture", lifecycleAction: "link" } }));
  const tasks = `# Task List: ${f.name}\n\n### \`[x]\` **1.1 Done**\n`;
  await f.seed(recordReferences["work-item/task-list"](f.live.reference.owner), tasks);
  await mkdir(join(f.cwd, ".arc", "active"), { recursive: true });
  await writeFile(join(f.cwd, ".arc", "active", `tasks-${f.name}.md`), tasks);
  const bin = join(f.cwd, ".git", "host-bin"), state = join(bin, "request.json");
  await mkdir(bin); await writeFile(state, JSON.stringify({ state: "OPEN", isDraft: false }));
  await writeFile(join(bin, "gh"), `#!${process.execPath}\nconst fs = require('node:fs');\nconst state = ${JSON.stringify(state)};\nif (process.argv[3] === 'view') process.stdout.write(fs.readFileSync(state));\nelse if (process.argv[3] === 'close') fs.writeFileSync(state, JSON.stringify({state:'CLOSED'}));\nelse throw new Error('Unexpected host operation');\n`);
  await chmod(join(bin, "gh"), 0o755);
  const oldPath = process.env.PATH;
  let result: Awaited<ReturnType<typeof repairCli>>;
  try { process.env.PATH = `${bin}:${oldPath ?? ""}`; result = await repairCli(f, ["reopen", "example"], { store: f.store }); }
  finally { process.env.PATH = oldPath; }
  expect(lifecycleSuccess(await f.store.read({ reference: f.archived.reference }))).toEqual(f.archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: f.live.reference })).fields).toMatchObject({ state: "Active" });
  expect(JSON.parse(await readFile(state, "utf8"))).toMatchObject({ state: "CLOSED" });
}, 60_000);
