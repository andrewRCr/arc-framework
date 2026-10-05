/** Local review authority stays with the supplied checkout across conflicting repository defaults. */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import { readLocalReviewLiveContext } from "../../src/scripts/review-gate/hosts/local/live-context.js";
import { execFileAsync, makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
const slug = "checkout-errand";
const branch = `chore/${slug}`;
const targetClaim = "0123456789abcdef0123456789abcdef";
const otherClaim = "abcdef0123456789abcdef0123456789";
type ClaimState = "open" | "awaiting-merge" | "paused" | "absent" | "malformed";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => removeGitBackedDir(root)));
});

async function git(root: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd: root })).stdout.trim();
}

async function repository(state: ClaimState, claimId: string): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-live-context-checkout-", identity: "andrew" });
  roots.push(root);
  await git(root, ["commit", "--allow-empty", "-m", "code base"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (state !== "absent") {
    const content = state === "malformed" ? "{}\n" : serializeTransientIdentityRecord(
      TransientIdentityRecordV3Schema.parse({
        version: 3, kind: "errand", slug, claimId, purpose: "errand", origin: "description", originEntry: null,
        intent: "Review the selected checkout", branch, state,
        savedHead: state === "paused" ? head : null,
        changeRequest: state === "awaiting-merge" ? {
          repositoryRef: "owner/repository", hostRef: "https://github.com/owner/repository/pull/42",
          baseRef: "main", headRef: branch, headSha: head,
        } : null,
        createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
      }),
    );
    await writeFile(join(root, slug), content);
    await git(root, ["add", slug]);
    await git(root, ["commit", "-m", "identity snapshot"]);
    await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
  }
  await git(root, ["switch", "-c", branch, head]);
  return root;
}

describe("local review checkout identity", () => {
  it.each(["open", "awaiting-merge"] as const)(
    "selects the supplied checkout's %s claim instead of the executor's default", async (state) => {
      const target = await repository(state, targetClaim);
      const other = await repository("open", otherClaim);
      expect(await readLocalReviewLiveContext({ cwd: target, exec: makeGitExec(other) })).toEqual({
        context: { activeIdentity: "andrew", workUnit: null, errand: { identity: slug, claimId: targetClaim } },
        meta: null,
      });
    },
  );

  it.each(["paused", "absent"] as const)(
    "preserves %s authority instead of adopting another checkout's live claim", async (state) => {
      const target = await repository(state, targetClaim);
      const other = await repository("open", otherClaim);
      expect(await readLocalReviewLiveContext({ cwd: target, exec: makeGitExec(other) })).toEqual({
        context: { activeIdentity: "andrew", workUnit: null, errand: null }, meta: null,
      });
    },
  );

  it("refuses malformed selected claims even when the executor defaults to a valid claim", async () => {
    const target = await repository("malformed", targetClaim);
    const other = await repository("open", otherClaim);
    await expect(readLocalReviewLiveContext({ cwd: target, exec: makeGitExec(other) })).rejects.toThrow();
  });

  it("reads a valid selected claim without importing another checkout's corruption", async () => {
    const target = await repository("open", targetClaim);
    const other = await repository("malformed", otherClaim);
    expect(await readLocalReviewLiveContext({ cwd: target, exec: makeGitExec(other) })).toEqual({
      context: { activeIdentity: "andrew", workUnit: null, errand: { identity: slug, claimId: targetClaim } },
      meta: null,
    });
  });
});
