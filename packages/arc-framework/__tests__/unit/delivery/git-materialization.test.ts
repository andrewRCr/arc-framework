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

  it("classifies publication failure from the exact reobserved remote state", async () => {
    const afterFailure = (observed: string | null | "unavailable"): GitExec => {
      let reads = 0;
      return async (_command, args) => {
        if (args[0] === "ls-remote") {
          reads += 1;
          if (reads === 1) return { stdout: "" };
          if (observed === "unavailable") throw new Error("offline");
          return { stdout: observed === null ? "" : `${observed}\t${ref}\n` };
        }
        throw new Error("push failed");
      };
    };
    await expect(publishDeliveryRemoteRef({ exec: afterFailure(head), remote: "origin", ref, head }))
      .resolves.toEqual({ status: "adopted" });
    await expect(publishDeliveryRemoteRef({
      exec: afterFailure("b".repeat(40)), remote: "origin", ref, head,
    })).resolves.toEqual({ status: "refused", reason: "stale-lease" });
    for (const observed of [null, "unavailable"] as const) {
      await expect(publishDeliveryRemoteRef({ exec: afterFailure(observed), remote: "origin", ref, head }))
        .resolves.toEqual({ status: "refused", reason: "unavailable" });
    }
  });

  it("reports unavailable when a successful push leaves no observable ref", async () => {
    const exec: GitExec = async () => ({ stdout: "" });
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head }))
      .resolves.toEqual({ status: "refused", reason: "unavailable" });
  });

  it("reports a stale lease when a successful push leaves a foreign head", async () => {
    const foreignHead = "b".repeat(40);
    let reads = 0;
    const exec: GitExec = async (_command, args) => {
      if (args[0] !== "ls-remote") return { stdout: "" };
      reads += 1;
      return { stdout: reads === 1 ? "" : `${foreignHead}\t${ref}\n` };
    };
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head }))
      .resolves.toEqual({ status: "refused", reason: "stale-lease" });
  });
});
