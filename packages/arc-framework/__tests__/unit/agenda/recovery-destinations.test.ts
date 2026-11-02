/** Recovery commands require exact cascade evidence and proven checkout availability. */
import { describe, expect, it } from "vitest";
import { resolveRecoveryDestinations } from "../../../src/commands/agenda/recovery-destinations.js";
import type { AgendaReadPort } from "../../../src/commands/agenda/compile-input.js";
import { inferBranchGoneRecovery } from "../../../src/lib/session-init/recommended-action.js";
import { SessionInitRecoveryValueSchema, type CascadeResolution } from "../../../src/lib/session-init/branch-gone-cascade.js";
import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";

const candidate = { branch: "feat/recover", proposedAction: "switch" } as const;
function recovery(value: CascadeResolution) {
  return SessionInitRecoveryValueSchema.parse(inferBranchGoneRecovery(value, { state: "clean", fileCount: 0 }));
}
function readPort(registrations: Record<string, string> = {}, missingRefs: string[] = []): AgendaReadPort {
  const { exec } = scriptGitExec([
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ stdout: Object.entries(registrations).map(([branch, path]) => `worktree ${path}\0HEAD abc123\0branch refs/heads/${branch}\0\0`).join("") }] },
    { match: { prefix: ["rev-parse", "--verify", "--quiet"] }, responses: [({ args }) => {
      const ref = args[3];
      if (ref === undefined || !ref.startsWith("refs/heads/")) throw new Error("Expected an exact local branch ref");
      return missingRefs.includes(ref.slice("refs/heads/".length)) ? { failure: { exitCode: 1 } } : { stdout: "abc123" };
    }] },
  ]);
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected file read"); };
  return { exists: unexpected, size: unexpected, read: unexpected, git: async args => (await exec("git", [...args])).stdout };
}

describe("recovery destinations", () => {
  it.each([
    { input: { kind: "resolved", remoteEvidence: "exact", candidate }, branches: [candidate.branch] },
    { input: { kind: "surface", remoteEvidence: "exact", candidates: [candidate,
      { proposedAction: "removable", branch: "feat/old", worktreePath: "/wt/old", workUnitName: "old" },
      { proposedAction: "external", branch: "feat/manual", worktreePath: "/wt/manual" },
      { ...candidate, branch: "feat/other" }] }, branches: [candidate.branch, "feat/other"] },
    { input: { kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" }, branches: ["main"] },
  ] satisfies { input: CascadeResolution; branches: string[] }[])("locates only permitted switch branches for $input.kind", async ({ input, branches }) => {
    const destinations = await resolveRecoveryDestinations(recovery(input), readPort());
    expect(destinations).toEqual(branches.map(branch => ({ branch, kind: "free", actions: [
      { argv: ["git", "switch", branch], text: `git switch ${branch}` },
    ] })));
  });

  it.each([
    { path: "/wt/from candidate", registered: "/wt/other", expected: "/wt/from candidate" },
    { path: undefined, registered: "/wt/registered\ncheckout", expected: "/wt/registered\ncheckout" },
  ])("holds a switch destination found at $expected", async ({ path, registered, expected }) => {
    const value = recovery({ kind: "resolved", remoteEvidence: "exact", candidate: {
      ...candidate, ...(path === undefined ? {} : { worktreePath: path }),
    } });
    expect(await resolveRecoveryDestinations(value, readPort({ [candidate.branch]: registered })))
      .toEqual([{ branch: candidate.branch, kind: "elsewhere", checkoutPath: expected }]);
  });


  it("holds when the independent worktree read fails", async () => {
    const read = readPort();
    read.git = async args => { throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "worktree read denied" }); };
    expect(await resolveRecoveryDestinations(recovery({ kind: "resolved", remoteEvidence: "exact", candidate }), read))
      .toEqual([{ branch: candidate.branch, kind: "unavailable" }]);
  });


  it("fetches a free branch only when its exact local ref is absent", async () => {
    const value = recovery({ kind: "surface", remoteEvidence: "exact", candidates: [candidate,
      { ...candidate, branch: "feat/local" }] });
    expect(await resolveRecoveryDestinations(value, readPort({}, [candidate.branch]))).toEqual([
      { branch: candidate.branch, kind: "free", actions: [
        { argv: ["git", "fetch", "origin", candidate.branch], text: `git fetch origin ${candidate.branch}` },
        { argv: ["git", "switch", candidate.branch], text: `git switch ${candidate.branch}` },
      ] },
      { branch: "feat/local", kind: "free", actions: [
        { argv: ["git", "switch", "feat/local"], text: "git switch feat/local" },
      ] },
    ]);
  });


  it("holds when a local ref cannot be inspected", async () => {
    const read = readPort();
    const git = read.git;
    read.git = async args => {
      if (args[0] === "rev-parse") throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "ref access denied" });
      return git(args);
    };
    expect(await resolveRecoveryDestinations(recovery({ kind: "resolved", remoteEvidence: "exact", candidate }), read))
      .toEqual([{ branch: candidate.branch, kind: "unavailable" }]);
  });


  it.each([
    { kind: "pending", remoteEvidence: "pending-fetch", candidates: [candidate], pendingBranchCount: 1,
      refreshRemedy: { argv: ["arc", "active", "in-flight", "--json"], text: "Refresh recovery candidates" } },
    { kind: "unproven", remoteEvidence: "pending-fetch", candidates: [candidate] },
  ] satisfies CascadeResolution[])("keeps $kind candidates out of executable destinations", async value => {
    expect(await resolveRecoveryDestinations(recovery(value), readPort())).toEqual([]);
  });

});
