/** Repository-qualified branch resolution leaves consumer refusal policy outside the shared reader. */
import { expect, it } from "vitest";
import { resolveLinkedCheckoutBranch } from "../../../src/lib/git/default-capture-set.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

it("returns the qualified branch link and its authority for the checkout's short HEAD name", async () => {
  const { exec } = scriptGitExec([{ match: ["symbolic-ref", "--quiet", "--short", "HEAD"],
    responses: [{ stdout: "feat/example\n", stderr: "" }] }]);
  const link = { repository: "project", ref: "refs/heads/feat/example", linkedAs: "adopted" as const,
    excluded: [{ repository: "project", sha: "a".repeat(40) }] };
  expect(await resolveLinkedCheckoutBranch({ exec, cwd: "/checkout", repository: "project", branches: [link] }))
    .toEqual({ kind: "linked", link });
});
