/** Git adapter tests for fresh lifecycle-contribution revalidation. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { revalidateDeliveryLifecycleContribution } from "../../../src/lib/delivery/git-lifecycle-contribution.js";

describe("revalidateDeliveryLifecycleContribution", () => {
  it("detects a contribution introduced after an earlier successful read", async () => {
    const path = ".arc/active/meta-example.md";
    const oid = "a".repeat(40);
    let candidateHasEntry = false;
    const exec: GitExec = async (_command, args) => ({
      stdout: args[2] === "candidate" && candidateHasEntry
        ? `100644 blob ${oid}\t${path}\0`
        : "",
    });
    const input = {
      exec,
      protectedBaseRef: "base",
      candidateRef: "candidate",
      paths: [path],
    };

    await expect(revalidateDeliveryLifecycleContribution(input)).resolves.toEqual({ status: "ok" });
    candidateHasEntry = true;
    await expect(revalidateDeliveryLifecycleContribution(input)).resolves.toEqual({
      status: "refused",
      reason: "contribution-mismatch",
      paths: [path],
    });
  });

  it("fails closed when an exact entry cannot be read", async () => {
    const path = ".arc/backlog/ROADMAP.md";
    const exec: GitExec = async () => ({ stdout: "malformed\0" });

    await expect(revalidateDeliveryLifecycleContribution({
      exec,
      protectedBaseRef: "base",
      candidateRef: "candidate",
      paths: [path],
    })).resolves.toEqual({
      status: "refused",
      reason: "entry-unavailable",
      paths: [path],
    });
  });
});
