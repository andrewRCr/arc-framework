import { describe, expect, it } from "vitest";

import {
  deriveDeliveryResolutionWorkspacePath,
  observeDeliveryResolutionWorkspace,
  removeDeliveryResolutionWorkspace,
} from "../../../src/lib/delivery/conflict-resolution-workspace.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";

describe("delivery conflict resolution workspace", () => {
  const path = "/repo/.git/arc/delivery-resolutions/123e4567-e89b-42d3-a456-426614174000/member-one";
  const head = "7".repeat(40);

  it("derives one deterministic workspace inside the Git-common ARC namespace", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const member = plan.members[1]!;
    expect(deriveDeliveryResolutionWorkspacePath({
      plan,
      deliverableId: member.deliverableId,
      gitCommonDir: "/repo/.git",
    })).toEqual({
      status: "derived",
      path: `/repo/.git/arc/delivery-resolutions/${plan.planId}/${member.chunkKey}`,
    });
  });

  it("ignores another checkout that only shares the expected head", async () => {
    const exec: GitExec = async (_command, args) => args[0] === "worktree"
      ? { stdout: `worktree /repo\0HEAD ${head}\0branch refs/heads/main\0\0worktree /tmp/other\0HEAD ${head}\0detached\0\0` }
      : { stdout: "" };
    await expect(observeDeliveryResolutionWorkspace({
      exec, path, pathExists: async () => false,
    })).resolves.toEqual({ status: "absent" });
  });

  it("refuses foreign workspaces and removes only an exact clean detached workspace", async () => {
    for (const workspace of [
      { branch: "branch refs/heads/member-one", status: "", expectedHead: head, reason: "attached" },
      { branch: "detached", status: " M file.txt\n", expectedHead: head, reason: "dirty" },
      { branch: "detached", status: "", expectedHead: "8".repeat(40), reason: "head-mismatch" },
    ] as const) {
      let present = true;
      const exec: GitExec = async (_command, args) => {
        if (args[0] === "worktree" && args[1] === "list") {
          return present
            ? { stdout: `worktree ${path}\0HEAD ${head}\0${workspace.branch}\0\0` }
            : { stdout: "" };
        }
        if (args[0] === "status") return { stdout: workspace.status };
        if (args[0] === "worktree" && args[1] === "remove") {
          present = false;
          return { stdout: "" };
        }
        throw new Error("unexpected git operation");
      };
      await expect(removeDeliveryResolutionWorkspace({
        exec,
        path,
        expectedHead: workspace.expectedHead,
        pathExists: async () => present,
      })).resolves.toMatchObject({ status: "refused", reason: workspace.reason });
      expect(present).toBe(true);
    }

    let present = true;
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return present
          ? { stdout: `worktree ${path}\0HEAD ${head}\0detached\0\0` }
          : { stdout: "" };
      }
      if (args[0] === "status") return { stdout: "" };
      if (args[0] === "worktree" && args[1] === "remove") {
        present = false;
        return { stdout: "" };
      }
      throw new Error("unexpected git operation");
    };
    await expect(removeDeliveryResolutionWorkspace({
      exec, path, expectedHead: head, pathExists: async () => present,
    })).resolves.toEqual({ status: "removed" });
    expect(present).toBe(false);
    await expect(removeDeliveryResolutionWorkspace({
      exec, path, expectedHead: head, pathExists: async () => present,
    })).resolves.toEqual({ status: "adopted" });
  });
});
