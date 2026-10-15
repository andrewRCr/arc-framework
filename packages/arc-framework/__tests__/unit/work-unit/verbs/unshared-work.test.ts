/** Sharing observations follow recorded work branches and refreshed published refs. */
import { expect, it } from "vitest";
import { readUnsharedWork } from "../../../../src/lib/work-unit/verbs/unshared-work.js";
import { runHandover, runPause } from "../../../../src/lib/work-unit/verbs/pause-handover.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { LocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
it.each(["main", "person"])("observes linked work for pause and handover while the holder is on %s", async (branch) => {
  const h = createLifecycleHarness(), sha = "1".repeat(40), base = "2".repeat(40);
  await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "active" },
    { branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const git = scriptGitExec([
    { match: ["status", "--porcelain"], responses: [{ stdout: "" }] },
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: [{ stdout: branch }] },
    { match: ["remote"], responses: [{ stdout: "" }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}"], responses: [{ stdout: base }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/feat/example^{commit}"], responses: [{ stdout: sha }] },
    { match: ["--no-replace-objects", "rev-list", "refs/heads/feat/example", "--not", "refs/heads/main"], responses: [{ stdout: sha }] },
  ]);
  const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => "/checkout",
    writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
  const ctx = { store: h.store, cwd: "/checkout", identity: "test-user", exec: git.exec, baseBranch: "main", repository: "repo", locusPorts };
  const report = { kind: "observed", branch: "feat/example", changedPaths: [], origin: "none", unsharedCommits: [], heldOnlyCommits: [sha] };
  expect(await runPause(ctx, { name: "example", identity: "test-user", reason: "Wait." })).toMatchObject({ status: "paused", report });
  expect(await runHandover(ctx, { name: "example", to: "next-user" })).toMatchObject({ status: "handed-over", report });
});
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
