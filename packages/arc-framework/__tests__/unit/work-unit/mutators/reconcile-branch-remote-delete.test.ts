/** Leased remote deletion distinguishes successful absence from unresolved refusals. */
import { describe, expect, it } from "vitest";
import { deleteRemoteBranch } from "../../../../src/lib/work-unit/mutators/reconcile-branch.js";
import { scriptGitExec, type GitExecScriptEntry } from "../../../helpers/git-exec-fake.js";

const oid = "a".repeat(40);
const leasedDelete: GitExecScriptEntry = {
  match: ["push", "origin", `--force-with-lease=refs/heads/feat/demo:${oid}`, ":refs/heads/feat/demo"],
  responses: [{ failure: { exitCode: 1, stderr: "! [rejected] (delete) -> feat/demo (stale info)" } }],
};
const probe = ["ls-remote", "--heads", "origin", "refs/heads/feat/demo"];

describe("deleteRemoteBranch leased replay", () => {
  it("accepts an absent live ref after a stale lease rejection", async () => {
    const { exec } = scriptGitExec([leasedDelete, { match: probe, responses: [{ stdout: "" }] }]);
    await expect(deleteRemoteBranch(exec, "origin", "feat/demo", oid)).resolves.toBe("absent");
  });

  it.each([`${"b".repeat(40)}\trefs/heads/feat/demo\n`, "unrecognized remote response\n"])(
    "retains a stale refusal when remote evidence is nonempty: %s", async (stdout) => {
      const { exec } = scriptGitExec([leasedDelete, { match: probe, responses: [{ stdout }] }]);
      await expect(deleteRemoteBranch(exec, "origin", "feat/demo", oid)).resolves.toBe("stale");
    },
  );

  it("propagates a failed absence observation instead of resolving the delete", async () => {
    const { exec } = scriptGitExec([leasedDelete, {
      match: probe, responses: [{ failure: { exitCode: 128, stderr: "fatal: Could not read from remote repository." } }],
    }]);
    await expect(deleteRemoteBranch(exec, "origin", "feat/demo", oid)).rejects.toMatchObject({
      kind: "nonzero-exit", exitCode: 128,
    });
  });
});
