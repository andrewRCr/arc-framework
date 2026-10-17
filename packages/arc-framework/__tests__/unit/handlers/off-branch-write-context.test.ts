/** Off-branch preflights allow detached code checkouts without a base branch. */
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
const binding = vi.hoisted(() => ({ exec: undefined as import("../../../src/lib/git/exec.js").GitExec | undefined }));
vi.mock("../../../src/handlers/shared.js", () => ({ requireArcProjectRoot: () => "/repo" }));
vi.mock("../../../src/lib/io-context.js", () => ({ createGitExec: () => binding.exec }));
vi.mock("../../../src/lib/config/status-reader.js", () => ({ readConfigSettings: async () => ({ settings: { "branch.base": null, "branch.protection": "full" } }) }));
import { handlePlanCheck } from "../../../src/handlers/plan.js";
import { handleHousekeepCheck } from "../../../src/handlers/housekeep.js";
beforeEach(() => { vi.resetAllMocks(); process.exitCode = undefined; });
afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
it.each(["plan", "housekeep"])("%s check proceeds on detached HEAD with no base when state is off branch", async (command) => {
  const git = scriptGitExec([{ match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "HEAD\n" }] },
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ stdout: "" }] }]);
  binding.exec = git.exec;
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const h = createLifecycleHarness();
  if (command === "plan") await handlePlanCheck({ json: true }, undefined, h.store);
  else await handleHousekeepCheck({ json: true }, undefined, h.store);
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject(command === "plan"
    ? { route: "proceed", currentBranch: null, protection: "full" }
    : { verdict: "proceed", currentBranch: null, baseBranch: null, branchProtection: "full" });
  expect(process.exitCode).toBeUndefined();
  expect(git.calls.map((call) => call.args)).toEqual([["rev-parse", "--abbrev-ref", "HEAD"]]);
});
