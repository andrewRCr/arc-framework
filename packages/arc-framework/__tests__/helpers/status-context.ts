/** Production status contexts over a selected store and scripted identity evidence. */
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreSyncPort } from "../../src/lib/store/operational-sync.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createSessionStatusContext } from "../../src/handlers/status/session-context.js";
import { scriptGitExec, scriptRawGitExec } from "./git-exec-fake.js";

/** Bind the production context without requiring a Git repository in a unit fixture. */
export async function createTestStatusContext(input: { store: Store; cwd?: string; exec?: GitExec; sync?: StoreSyncPort; identity?: string | null }) {
  const { exec } = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [input.identity === null ? { failure: { exitCode: 1 } } : { stdout: `${input.identity ?? "alice"}\0` }] },
    { match: ["config", "--null", "--get", "user.name"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["config", "--get", "arc.role"], responses: [{ stdout: "maintainer" }] },
    { match: { predicate: () => true }, responses: [call => input.exec === undefined
      ? { failure: { exitCode: 128, stderr: "fatal: not a git repository" } }
      : input.exec(call.command, call.args, call.options)] },
  ]);
  const { exec: raw } = scriptRawGitExec([{ match: { predicate: () => true },
    responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] }]);
  return createSessionStatusContext(input.cwd ?? "/current", exec, raw, raw, undefined, { store: input.store, sync: input.sync });
}
