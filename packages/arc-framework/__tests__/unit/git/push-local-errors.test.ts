/** Local executor failures remain actionable errors rather than remote push outcomes. */
import { expect, it } from "vitest";
import { pushRefs } from "../../../src/lib/git/push.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";
import { withGitVersionFloor } from "../../../src/lib/git/version-floor.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const ref = "refs/arc/work/example", next = "a".repeat(40);
const published = { stdout: `To <receiver>\n*\t${next}:${ref}\t[new reference]\nDone\n`, stderr: "" };

it.each([
  { defect: "an ordinary local error", failure: new Error("Cannot initialize the executor") },
  { defect: "a programming type error", failure: new TypeError("Cannot encode the local request") },
  { defect: "a missing Git executable", failure: new GitProcessError({ kind: "spawn-failure", command: "git", args: ["push"],
    cause: Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }) }) },
])("propagates $defect and succeeds after the executor is repaired", async ({ failure }) => {
  let broken = true;
  const exec: GitExec = async () => { if (broken) throw failure; return published; };
  await expect(pushRefs(exec, "receiver", [{ ref, next }])).rejects.toBe(failure);
  broken = false;
  expect(await pushRefs(exec, "receiver", [{ ref, next }])).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
});

it("retains the Git upgrade diagnosis and original cause, then retries successfully", async () => {
  const cause = new GitProcessError({ kind: "nonzero-exit", command: "git", args: ["push"], exitCode: 129,
    stderr: "unknown option: --porcelain" });
  let broken = true;
  const exec = withGitVersionFloor<Parameters<GitExec>, Awaited<ReturnType<GitExec>>>(
    async () => { if (broken) throw cause; return published; }, async () => "git version 2.43.0\n");
  await expect(pushRefs(exec, "receiver", [{ ref, next }])).rejects.toMatchObject({
    message: expect.stringMatching(/Git 2\.43\.0.*required Git 2\.47.*Upgrade Git and retry/u), cause,
  });
  broken = false;
  expect(await pushRefs(exec, "receiver", [{ ref, next }])).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
});

it("retains a legacy executable spawn failure as an actionable typed error with its cause", async () => {
  const cause = Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
  let broken = true;
  const exec: GitExec = async () => { if (broken) throw cause; return published; };
  await expect(pushRefs(exec, "receiver", [{ ref, next }])).rejects.toMatchObject({
    name: "GitProcessError", kind: "spawn-failure", code: "git.spawn-failure", cause,
  });
  broken = false;
  expect(await pushRefs(exec, "receiver", [{ ref, next }])).toMatchObject({ status: "refs", refs: [{ ref, status: "ok" }] });
});
