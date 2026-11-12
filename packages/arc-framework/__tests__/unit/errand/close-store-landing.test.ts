/** Store migration behavior through production store and runtime boundaries. */
import { expect, it } from "vitest";
import { readCloseLandingCommit } from "../../../src/lib/errand/close-store-landing.js";
import { createGhChangeRequestLifecyclePort } from "../../../src/lib/errand/change-request-lifecycle.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec, scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import type { CloseTarget } from "../../../src/lib/errand/close-locus.js";
const head = "a".repeat(40), merge = "b".repeat(40);
async function fixture() {
  const h = createLifecycleHarness();
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, slug: "fix-it", claimId: "c".repeat(32), createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z",
    kind: "errand", purpose: "errand", intent: "Fix", branch: "chore/fix-it", state: "awaiting-merge", savedHead: null, origin: "description", originEntry: null,
    changeRequest: { repositoryRef: "org/repo", hostRef: "github.com", baseRef: "main", headRef: "chore/fix-it", headSha: head } });
  if (record.kind !== "errand" || record.purpose !== "errand" || record.state !== "awaiting-merge") throw new Error("Expected awaiting Errand");
  const git = scriptGitExec([{ command: "gh", match: { prefix: ["pr", "list"] }, responses: [{ stdout: JSON.stringify([{ number: 1, state: "MERGED", baseRefName: "main", headRefName: "chore/fix-it", headRefOid: head, reviewDecision: null, mergeCommit: { oid: merge } }]) }] },
    { match: ["rev-parse", "--show-toplevel"], responses: [{ stdout: "/checkout" }] }]);
  const lifecycle = await createGhChangeRequestLifecyclePort(git.exec, undefined, true).read(record.changeRequest, record.changeRequest);
  const target: CloseTarget = { kind: "merged", record, changeRequest: record.changeRequest };
  return { ...h, git, lifecycle, target };
}
it("captures the squash landing commit under the project ID without fetching missing objects", async () => {
  const f = await fixture(), raw = scriptRawGitExec([{ match: ["--no-replace-objects", "cat-file", "--batch"], responses: [{ stdout: Buffer.from(`${merge} missing\n`), stderr: Buffer.alloc(0) }] }]);
  expect(await readCloseLandingCommit({ store: f.store, exec: f.git.exec, execRaw: raw.exec, projectId: async () => "project" }, f.target, f.lifecycle))
    .toEqual({ kind: "ready", capture: { repository: "project", sha: merge } });
  expect(raw.calls).toHaveLength(1);
  expect(f.git.calls.some((call) => call.args.includes("fetch"))).toBe(false);
});
it("captures a local landing commit's copy key and omits one for a merge commit", async () => {
  const f = await fixture();
  const body = `tree ${"d".repeat(40)}\nparent ${head}\nauthor Test <test@example.com> 123 +0000\ncommitter Test <test@example.com> 123 +0000\n\nLanding\n`;
  const raw = scriptRawGitExec([{ match: ["--no-replace-objects", "cat-file", "--batch"], responses: [{ stdout: Buffer.from(`${merge} commit ${Buffer.byteLength(body)}\n${body}\n`), stderr: Buffer.alloc(0) }] },
    { match: { prefix: ["--no-replace-objects", "-c"] }, responses: [{ stdout: Buffer.from("diff --git a/a b/a\n+patch\n"), stderr: Buffer.alloc(0) }] },
    { match: ["patch-id", "--verbatim"], responses: [{ stdout: Buffer.from(`${"e".repeat(40)} ${merge}\n`), stderr: Buffer.alloc(0) }] }]);
  expect(await readCloseLandingCommit({ store: f.store, exec: f.git.exec, execRaw: raw.exec, projectId: async () => "project" }, f.target, f.lifecycle))
    .toMatchObject({ kind: "ready", capture: { repository: "project", sha: merge, copyKey: expect.stringMatching(/^v1:/u) } });
});
it("refuses a missing project ID and gives unchanged-base close no capture", async () => {
  const f = await fixture();
  expect(await readCloseLandingCommit({ store: f.store, exec: f.git.exec }, f.target, f.lifecycle)).toMatchObject({ kind: "refused", reason: expect.stringContaining("identity") });
  expect(await readCloseLandingCommit({ store: f.store, exec: f.git.exec }, { kind: "unchanged-base", record: f.target.record, headSha: head }, null)).toEqual({ kind: "ready" });
});
