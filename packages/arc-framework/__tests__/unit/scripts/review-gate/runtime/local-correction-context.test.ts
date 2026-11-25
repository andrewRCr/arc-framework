/** Explicit member refs resolve their own policy coordinates while a successor occupies the checkout. */
import { expect, it } from "vitest";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { resolveLocalPolicyTarget } from "../../../../../src/scripts/review-gate/runtime/local-correction-context.js";

it("binds a member policy target through its retained branch rather than the successor checkout", async () => {
  const headSha = "a".repeat(40), repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId, baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40), headSha, headTree: "d".repeat(40) });
  const { exec } = scriptGitExec([
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "member-2" }] },
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repo.git" }] },
    { match: ["check-ref-format", "--branch", "member-1"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "refs/heads/member-1^{commit}"], responses: [{ stdout: headSha }] },
    { match: ["ls-remote", "--heads", "origin", "refs/heads/member-1"], responses: [{ stdout: `${headSha}\trefs/heads/member-1` }] },
    { command: "gh", match: ["pr", "list", "--repo", "owner/repo", "--state", "all", "--head", "member-1", "--limit", "100",
      "--json", "number,url,state,baseRefName,headRefName,headRefOid"], responses: [{ stdout: JSON.stringify([{ number: 41,
        url: "https://github.com/owner/repo/pull/41", state: "OPEN", baseRefName: "main", headRefName: "member-1", headRefOid: headSha }]) }] },
  ]);
  const input = { cwd: "/repo", exec, headRef: "member-1" };
  await expect(resolveLocalPolicyTarget(input, repositoryId, target, "main"))
    .resolves.toEqual({ repository: "owner/repo", pullRequest: 41, headSha });
});
