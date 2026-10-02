/** Scoped inbox projection and primary-root materialization match existing readers. */
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { materializeArcPath, resolveArcPath } from "../../../src/lib/layout/index.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { resolveUserSurfaceResolver } from "../../../src/lib/user-surfaces.js";

const identity = SlugSchema.parse("andrew");
const primary = join(process.cwd(), "primary-checkout");
const linked = join(process.cwd(), "linked-checkout");
const exec: GitExec = async () => ({ stderr: "", stdout:
  `worktree ${primary}\0HEAD ${"1".repeat(40)}\0branch refs/heads/main\0\0`
  +`worktree ${linked}\0HEAD ${"2".repeat(40)}\0branch refs/heads/feat/sample\0\0`});

describe("inbox addresses", () => {
  it("projects the project inbox to its existing repository-relative surface", () => {
    expect(resolveArcPath({ kind: "inbox", scope: { kind: "project"}})).toBe(".arc/ATOMIC-INBOX.md");
  });

  it.each([primary, linked])("materializes the identity inbox under the selected global root from %s", async (cwd) => {
    const resolver = await resolveUserSurfaceResolver({ cwd, identity, exec});
    const address = resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity}});
    expect(address).toBe(".arc/user/andrew/USER-INBOX.md");
    // The existing working-memory path establishes the selected repository root without guessing Git topology.
    const root = dirname(dirname(dirname(dirname(resolver.workingMemoryPath))));
    expect(materializeArcPath(root, address)).toBe(resolver.identityGlobalPath("USER-INBOX.md"));
    expect(materializeArcPath(root, address)).toBe(join(primary, ".arc/user/andrew/USER-INBOX.md"));
  });
});
