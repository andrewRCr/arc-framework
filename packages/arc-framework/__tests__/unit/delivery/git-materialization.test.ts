import { describe, expect, it } from "vitest";

import {
  observeDeliveryRemoteRef,
  publishDeliveryRemoteRef,
} from "../../../src/lib/delivery/git-materialization.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const ref = "refs/heads/delivery/example/first";
const head = "a".repeat(40);

describe("delivery remote-ref leases", () => {
  it("creates an absent ref from the exact validated object and adopts an exact retry", async () => {
    let remoteHead: string | null = null;
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "ls-remote") {
        return { stdout: remoteHead === null ? "" : `${remoteHead}\t${ref}\n` };
      }
      const expected = ["push", "origin", `${head}:${ref}`, `--force-with-lease=${ref}:`];
      if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error("unexpected publication");
      remoteHead = head;
      return { stdout: "" };
    };
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head }))
      .resolves.toEqual({ status: "published" });
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head }))
      .resolves.toEqual({ status: "adopted" });
  });

  it("refuses a different remote head, malformed evidence, or an unavailable read", async () => {
    const collision: GitExec = async () => ({ stdout: `${"b".repeat(40)}\t${ref}\n` });
    await expect(publishDeliveryRemoteRef({ exec: collision, remote: "origin", ref, head }))
      .resolves.toEqual({ status: "refused", reason: "collision" });
    const malformed: GitExec = async () => ({ stdout: `invalid\t${ref}\n` });
    await expect(observeDeliveryRemoteRef(malformed, "origin", ref))
      .resolves.toEqual({ status: "refused", reason: "malformed" });
    const unavailable: GitExec = async () => { throw new Error("offline"); };
    await expect(observeDeliveryRemoteRef(unavailable, "origin", ref))
      .resolves.toEqual({ status: "refused", reason: "unavailable" });
  });
});
