/** Candidate history retains versions a path-following store history can omit. */
import { expect, it } from "vitest";
import { readRepositoryCandidateSupersessionChain, readRepositoryCandidateRecordRevision } from
  "../../../../../../../src/lib/store/kinds/review/candidate/history.js";
import { createStore } from "../../../../../../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/identity.js";
import { createCandidateAttestation, serializeCandidateManagedRecord } from
  "../../../../../../../src/lib/work-unit/candidate-attestation.js";
import { candidateFixture } from "../../../../../../helpers/store/tracked-write-fixture.js";
import { scriptGitExec, scriptGitExecInput } from "../../../../../../helpers/git-exec-fake.js";
import { testStorePorts } from "../../../../../../helpers/store/in-repo-ports.js";
import { success } from "../../../../../../helpers/store/suite-tools.js";

const oid = (character: string) => character.repeat(40);
const path = ".arc/system/.internal/candidates/example.json";
const merge = oid("d"), older = oid("a"), head = oid("e");

function fixture() {
  const grandparent = candidateFixture();
  const predecessor = { ...grandparent, attestation: createCandidateAttestation({ ...grandparent.attestation,
    subject: grandparent.subject, baseRevision: oid("b"), attestedAt: "2026-08-13T14:00:00Z",
    supersedes: grandparent.attestation.candidateId }) };
  const current = { ...predecessor, attestation: createCandidateAttestation({ ...predecessor.attestation,
    subject: predecessor.subject, baseRevision: oid("c"), attestedAt: "2026-08-14T14:00:00Z",
    supersedes: predecessor.attestation.candidateId }) };
  const grandparentContent = serializeCandidateManagedRecord(grandparent);
  const { exec } = scriptGitExec([
    { match: ["log", "--format=%H", "--", path], responses: [{ stdout: `${merge}\n${older}\n` }] },
    { match: ["log", head, "--format=%H", "--", path], responses: [{ stdout: `${merge}\n${older}\n` }] },
    { match: ["show", `${merge}:${path}`], responses: [{ stdout: serializeCandidateManagedRecord(predecessor) }] },
    { match: ["show", `${older}:${path}`], responses: [{ stdout: grandparentContent }] },
    { match: ["log", "--follow", "--topo-order", "--format=%H", "HEAD", "--", `:(literal)${path}`],
      responses: [{ stdout: `${older}\n` }] },
    { match: ["ls-tree", "-z", older, "--", `:(literal)${path}`],
      responses: [{ stdout: `100644 blob ${oid("f")}\t${path}\0` }] },
    { match: ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", older],
      responses: [{ stdout: "" }] },
  ]);
  const { exec: execInput } = scriptGitExecInput([
    { match: ["show", `${older}:${path}`], responses: [grandparentContent] },
    { match: ["cat-file", "commit", older], responses: [`tree ${oid("f")}\n\nInitial Candidate\n`] },
  ]);
  return { grandparent, predecessor, current, grandparentContent, exec,
    store: createStore(testStorePorts("/candidate", exec, execInput)) };
}

it("retains the linked version introduced by a merge commit instead of using the store's path-following history", async () => {
  const h = fixture();
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  expect(success(await h.store.history({ reference })).map((entry) => entry.content)).toEqual([h.grandparentContent]);
  await expect(readRepositoryCandidateSupersessionChain({ cwd: "/candidate", workUnit: "example", record: h.current, exec: h.exec }))
    .resolves.toEqual([
      { candidateId: h.predecessor.attestation.candidateId, baseRevision: h.predecessor.attestation.baseRevision,
        recordRevision: merge, reviewResponseCount: 0 },
      { candidateId: h.grandparent.attestation.candidateId, baseRevision: h.grandparent.attestation.baseRevision,
        recordRevision: older, reviewResponseCount: 0 },
    ]);
});

it("locates a Candidate's merge-introduced record revision at the review head", async () => {
  const h = fixture();
  await expect(readRepositoryCandidateRecordRevision({ cwd: "/candidate", workUnit: "example",
    candidateId: h.predecessor.attestation.candidateId, reviewHeadSha: head, exec: h.exec })).resolves.toBe(merge);
});
