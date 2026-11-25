/** Linear range proof through the actual Git object readers. */
import { expect, it } from "vitest";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { proveReviewDeltaRange } from "../../../../../src/scripts/review-gate/policy/review-delta-range-proof.js";

const oid = (character: string) => character.repeat(40);
const fields = { schemaVersion: 2 as const, semanticsVersion: "review-gate/v2" as const,
  kind: "change-set" as const, repositoryId: "repo-1", baseRef: "main", diffBaseSha: oid("a"),
  diffBaseTree: oid("b"), headSha: oid("c"), headTree: oid("d") };
const predecessor = createReviewTarget(fields);
const current = createReviewTarget({ ...fields, headSha: oid("e"), headTree: oid("f") });

type ProofInput = Parameters<typeof proveReviewDeltaRange>[0];
type Fault = "not-ancestor" | "ancestry-failure" | "merge-failure" | "merge-in-range" | "malformed-merges";

function input(overrides: Partial<ProofInput> = {}, fault?: Fault): ProofInput {
  const successor = overrides.current ?? current;
  return { predecessor, current: successor, convergence: "converged" as const, cwd: "/checkout",
    exec: scriptGitExec([
      { match: ["rev-parse", "--verify", `${predecessor.headSha}^{commit}`], responses: [{ stdout: predecessor.headSha }] },
      { match: ["rev-parse", "--verify", `${successor.headSha}^{commit}`], responses: [{ stdout: successor.headSha }] },
      { match: ["merge-base", "--is-ancestor", predecessor.headSha, successor.headSha], responses: [
        fault === "not-ancestor" || fault === "ancestry-failure"
          ? { failure: { exitCode: fault === "not-ancestor" ? 1 : 128 } } : { stdout: "" },
      ] },
      { match: ["rev-list", "--first-parent", "--merges", "--parents", `${predecessor.headSha}..${successor.headSha}`],
        responses: [fault === "merge-failure" ? { failure: { exitCode: 128 } } : {
          stdout: fault === "merge-in-range" ? `${oid("1")} ${predecessor.headSha} ${oid("2")}`
            : fault === "malformed-merges" ? "invalid merge parents" : "",
        }] },
    ]).exec, ...overrides };
}

it("proves a linear commit after convergence at the unchanged base", async () => {
  await expect(proveReviewDeltaRange(input())).resolves.toBe(true);
});

it("does not prove the converged look's own head", async () => {
  await expect(proveReviewDeltaRange(input({ current: predecessor }))).resolves.toBe(false);
});

it.each([
  { baseRef: "release" }, { diffBaseSha: oid("1") }, { diffBaseTree: oid("2") },
])("does not prove a moved base %j", async changed => {
  const moved = createReviewTarget({ ...fields, headSha: current.headSha, headTree: current.headTree, ...changed });
  await expect(proveReviewDeltaRange(input({ current: moved }))).resolves.toBe(false);
});

it.each(["none", "pending", "unconverged"] as const)("does not prove a %s predecessor", async convergence => {
  await expect(proveReviewDeltaRange(input({ convergence }))).resolves.toBe(false);
});

it.each(["not-ancestor", "ancestry-failure", "merge-failure", "merge-in-range", "malformed-merges"] as const)(
  "does not prove unreadable or nonlinear Git evidence: %s", async fault => {
    await expect(proveReviewDeltaRange(input({}, fault))).resolves.toBe(false);
  });
