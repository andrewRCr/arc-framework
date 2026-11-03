/** Validated branch-gone probes and checkout-bound reads shared by recovery scenarios. */
import type { AgendaCompileInput } from "../../src/commands/agenda/compile-input.js";
import type { CascadeResolution } from "../../src/lib/session-init/branch-gone-cascade.js";
import { createAgendaFixtureInput, frameWithRow, workUnitRow } from "./agenda-fixtures.js";
import { dirtyState, sessionInitFixture, worktreeSync, type SessionInitProbeOverrides } from "./session-init-fixtures.js";
import { scriptGitExec } from "./git-exec-fake.js";
import { makeMetaFixture } from "./meta-fixture.js";

/** Compose recovery fixtures through the real status producer and served-envelope assertion. */
export async function createRecoveryAgendaFixture(
  resolution: CascadeResolution, dirty = false, probes: SessionInitProbeOverrides = {},
): Promise<AgendaCompileInput> {
  const row = workUnitRow();
  const envelope = await sessionInitFixture({
    derivedLocusState: async () => frameWithRow(row),
    worktree: async () => worktreeSync({ branch: "feat/work", state: "branch-gone" }),
    dirty: async () => dirtyState({ state: dirty ? "dirty" : "clean", fileCount: dirty ? 1 : 0 }),
    recovery: async () => resolution,
    ...probes,
  });
  const head = row.checkout.head ?? "a".repeat(40);
  const { exec } = scriptGitExec([
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ stdout: "worktree /repo\0HEAD abc123\0branch refs/heads/feat/work\0\0" }] },
    { match: { prefix: ["rev-parse", "--verify", "--quiet"] }, responses: [{ stdout: "abc123" }] },
    { match: { prefix: ["rev-parse", "--verify", "--end-of-options"] }, responses: [{ stdout: head }] },
    { match: { prefix: ["log"] }, responses: [{ stdout: "abc123 Recent fixture work" }] },
  ]);
  return createAgendaFixtureInput(envelope, { read: {
    exists: async () => true, size: async () => 1000,
    read: async path => path.endsWith("SESSION-NOTES.md") ? `**Commit at Handoff:** ${head.slice(0, 10)}\n`
      : makeMetaFixture("work", { state: "Active", owner: "andrew", branch: "feat/work", workClass: "Light", currentWorkflow: "process-task-loop" }),
    git: async args => (await exec("git", [...args])).stdout,
  } });
}
