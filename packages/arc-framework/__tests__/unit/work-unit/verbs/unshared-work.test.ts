/** A remotely absent work branch cannot hide unshared work behind stale tracking refs. */
import { expect, it } from "vitest";
import { readUnsharedWork } from "../../../../src/lib/work-unit/verbs/unshared-work.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { LocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
it("drops even a locally resolvable stale branch tracking ref after bounded ls-remote proves absence", async () => {
  const h = createLifecycleHarness(), sha = "1".repeat(40), base = "2".repeat(40);
  const primary = await h.seedMeta("example", {}, { kind: "active" }, { branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const git = scriptGitExec([
    { match: ["remote"], responses: [{ stdout: "origin" }] },
    { match: ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"], responses: [{ stdout: "" }] },
    { match: ["fetch", "origin", "+refs/heads/feat/example:refs/remotes/origin/feat/example"], responses: [{ failure: { exitCode: 128, stderr: "couldn't find remote ref" } }] },
    { match: ["ls-remote", "--exit-code", "origin", "refs/heads/feat/example"], responses: [{ failure: { exitCode: 2 } }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"], responses: [{ stdout: base }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/feat/example^{commit}"], responses: [{ stdout: sha }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/feat/example^{commit}"], responses: [{ stdout: sha }] },
    { match: { prefix: ["--no-replace-objects", "rev-list"] }, responses: [(call) => ({ stdout: call.args.includes("refs/remotes/origin/feat/example") ? "" : sha })] },
  ]);
  const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => null, writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
  expect(await readUnsharedWork({ cwd: "/checkout", exec: git.exec, baseBranch: "main", repository: "repo", locusPorts }, primary))
    .toMatchObject({ kind: "observed", origin: "refreshed", unsharedCommits: [sha], warnings: [] });
  expect(git.calls.filter((call) => call.args[0] === "fetch" || call.args[0] === "ls-remote").every((call) => call.options?.signal !== undefined)).toBe(true);
});
