import { describe, expect, it } from "vitest";

import { deriveDeliveryProviderRefreshSubject } from
  "../../../../../src/lib/delivery/provider-refresh-observation.js";
import type { GitExec } from "../../../../../src/lib/git/exec.js";
import {
  decodeGhStackView,
  GhDeliveryProviderRefreshPort,
  type GhStackView,
} from "../../../../../src/scripts/delivery/hosts/github-refresh.js";
import type { DeliveryProviderProcessRunner } from
  "../../../../../src/scripts/delivery/provider-process.js";
import { DeliveryProviderProcessError } from
  "../../../../../src/scripts/delivery/provider-process.js";
import { deliveryFourMemberStackPlanFixture } from "../../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../../fixtures/delivery-state.js";

const oid = (digit: string): string => digit.repeat(40);

describe("GitHub provider refresh adapter", () => {
  it("decodes the official stack view contract and rejects an incomplete branch", () => {
    const view = {
      trunk: "main",
      currentBranch: "delivery/example/second",
      branches: [{
        name: "delivery/example/second",
        head: oid("2"),
        base: oid("1"),
        isCurrent: true,
        isMerged: false,
        isQueued: false,
        needsRebase: false,
        pr: { number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN" },
      }],
    };

    expect(decodeGhStackView(JSON.stringify(view))).toEqual(view);
    expect(decodeGhStackView(JSON.stringify({
      ...view,
      branches: [{ ...view.branches[0], base: undefined }],
    }))).toBeNull();
  });

  it("refuses before native observation when the official extension is unavailable", async () => {
    let nativeObserved = false;
    const port = new GhDeliveryProviderRefreshPort({
      git: async (_command, args) => {
        if (args[0] === "for-each-ref") return { stdout: "" };
        throw new Error(`unexpected git invocation: ${args.join(" ")}`);
      },
      gh: { run: async () => { throw new Error("extension unavailable"); } },
      nativeStack: { observe: async () => {
        nativeObserved = true;
        return { status: "unsupported" };
      } },
      checkoutPath: "/repo",
      remote: "origin",
    });
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(450 + index) },
      })),
    };
    const derived = deriveDeliveryProviderRefreshSubject({
      plan,
      state,
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
    });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");

    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before: derived.subject.before,
    })).resolves.toEqual({ status: "refused", reason: "unsupported" });
    expect(nativeObserved).toBe(false);
  });

  it("imports dependent refresh candidates without granting provider push authority", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(500 + index) },
      })),
    };
    const derived = deriveDeliveryProviderRefreshSubject({
      plan,
      state,
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
    });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const target = before.target?.coordinates;
    if (target === null || target === undefined) throw new Error("target must be bound");
    const targetName = before.target!.ref.replace(/^refs\/heads\//u, "");
    const afterHeads = before.members.map((member, index) => index === 0
      ? member.coordinates!.head
      : oid(String(index + 7)));
    const afterTrees = before.members.map((_member, index) => oid(String(index + 3)));
    let drift = false;
    const asView = (after: boolean): GhStackView => ({
      trunk: targetName,
      currentBranch: before.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
      branches: before.members.map((member, index) => ({
        name: drift && index === 0 ? "delivery/unexpected" : member.ref!.replace(/^refs\/heads\//u, ""),
        head: after ? afterHeads[index]! : member.coordinates!.head,
        base: after
          ? index === 0 ? target.head : afterHeads[index - 1]!
          : member.coordinates!.base,
        isCurrent: index === 0,
        isMerged: false,
        isQueued: false,
        needsRebase: false,
        pr: {
          number: Number(member.changeRequest!.changeRequestId),
          url: `https://github.com/owner/repo/pull/${member.changeRequest!.changeRequestId}`,
          state: "OPEN",
        },
      })),
    });
    let rebased = false;
    let workspaceRemoved = false;
    let conflict = false;
    const rebaseCalls: string[][] = [];
    const imported = new Map<string, string>();
    const treeByHead = new Map<string, string>([
      [target.head, target.tree],
      ...before.members.map((member) => [member.coordinates!.head, member.coordinates!.tree] as const),
      ...afterHeads.map((head, index) => [head, afterTrees[index]!] as const),
    ]);
    const git: GitExec = async (_command, args, options) => {
      const cwd = options?.cwd ?? "/repo";
      if (args[0] === "for-each-ref") {
        return { stdout: [...imported].map(([ref, head]) => `${ref} ${head}`).join("\n") };
      }
      if (args[0] === "remote" && args[1] === "get-url") return { stdout: "https://github.com/owner/repo.git\n" };
      if (args[0] === "clone" || args[0] === "remote" || args[0] === "switch") return { stdout: "" };
      if (args[0] === "fetch") {
        const refspec = args.at(-1)!;
        const [source, destination] = refspec.split(":");
        const sourceName = source?.replace(/^refs\/heads\//u, "");
        const index = asView(true).branches.findIndex(({ name }) => name === sourceName);
        if (destination === undefined || index < 0) throw new Error("invalid fetch fixture");
        imported.set(destination, afterHeads[index]!);
        return { stdout: "" };
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        imported.delete(args[2]!);
        return { stdout: "" };
      }
      if (args[0] === "rev-parse") {
        const ref = args.at(-1)!;
        const tree = ref.endsWith("^{tree}");
        const plain = tree ? ref.slice(0, -"^{tree}".length) : ref;
        const head = plain === `refs/heads/${targetName}`
          ? target.head
          : imported.get(plain) ?? plain;
        const value = tree ? treeByHead.get(head) : head;
        if (value === undefined) throw new Error(`unknown ref ${plain} at ${cwd}`);
        return { stdout: `${value}\n` };
      }
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };
    const gh: DeliveryProviderProcessRunner = {
      run: async (args) => {
        if (args.includes("push")) throw new Error("provider push is forbidden");
        if (args[1] === "--version" || args[1] === "checkout") return { stdout: "", stderr: "" };
        if (args[1] === "view") return { stdout: JSON.stringify(asView(rebased)), stderr: "" };
        if (args[1] === "rebase") {
          if (conflict) {
            throw new DeliveryProviderProcessError("conflict", { stdout: "", stderr: "", exitCode: 3 });
          }
          rebaseCalls.push([...args]);
          rebased = true;
          return { stdout: "", stderr: "" };
        }
        throw new Error(`unexpected gh invocation: ${args.join(" ")}`);
      },
    };
    const port = new GhDeliveryProviderRefreshPort({
      git,
      gh,
      nativeStack: { observe: async () => ({ status: "registered", stackNumber: 558 }) },
      checkoutPath: "/repo",
      remote: "origin",
      temporaryDirectories: {
        create: async () => "/tmp/refresh-fixture",
        remove: async () => { workspaceRemoved = true; },
      },
    });

    const result = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
      before,
    });
    if (result.status === "refused") throw new Error(result.reason);

    expect(result).toMatchObject({
      status: "prepared",
      observation: { targetMovement: "exact" },
      candidates: plan.members.slice(1, -1).map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/arc/delivery-refresh-candidates/${plan.planId}/${member.chunkKey}`,
        head: afterHeads[index + 1],
      })),
    });
    expect(result.observation.snapshot.members[0]?.coordinates?.head)
      .toBe(before.members[0]!.coordinates!.head);
    expect(workspaceRemoved).toBe(true);

    rebased = false;
    const complete = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before,
    });
    if (complete.status === "refused") throw new Error(complete.reason);
    expect(complete.observation).toMatchObject({
      targetMovement: "exact",
      snapshot: { target: before.target },
    });
    expect(rebaseCalls).toEqual([
      ["stack", "rebase", "--upstack", "--no-trunk"],
      ["stack", "rebase", "--upstack"],
    ]);

    rebased = false;
    conflict = true;
    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
      before,
    })).resolves.toEqual({ status: "refused", reason: "conflict" });
    conflict = false;
    drift = true;
    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before,
    })).resolves.toEqual({ status: "refused", reason: "scope-mismatch" });
  });

  it("cleans every candidate imported before a later import failure", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(600 + index) },
      })),
    };
    const derived = deriveDeliveryProviderRefreshSubject({
      plan,
      state,
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
    });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const target = before.target?.coordinates;
    if (target === null || target === undefined) throw new Error("target must be bound");
    const targetName = before.target!.ref.replace(/^refs\/heads\//u, "");
    const afterHeads = before.members.map((_member, index) => oid(String(index + 7)));
    const afterTrees = before.members.map((_member, index) => oid(String(index + 3)));
    const asView = (after: boolean): GhStackView => ({
      trunk: targetName,
      currentBranch: before.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
      branches: before.members.map((member, index) => ({
        name: member.ref!.replace(/^refs\/heads\//u, ""),
        head: after ? afterHeads[index]! : member.coordinates!.head,
        base: after ? index === 0 ? target.head : afterHeads[index - 1]! : member.coordinates!.base,
        isCurrent: index === 0,
        isMerged: false,
        isQueued: false,
        needsRebase: false,
        pr: {
          number: Number(member.changeRequest!.changeRequestId),
          url: `https://github.com/owner/repo/pull/${member.changeRequest!.changeRequestId}`,
          state: "OPEN",
        },
      })),
    });
    const imported = new Map<string, string>();
    const deleted: string[] = [];
    let fetchCount = 0;
    let cleanupFails = false;
    const treeByHead = new Map(afterHeads.map((head, index) => [head, afterTrees[index]!] as const));
    const git: GitExec = async (_command, args) => {
      if (args[0] === "for-each-ref") {
        return { stdout: [...imported].map(([ref, head]) => `${ref} ${head}`).join("\n") };
      }
      if (args[0] === "remote" && args[1] === "get-url") return { stdout: "https://github.com/owner/repo.git\n" };
      if (args[0] === "clone" || args[0] === "remote" || args[0] === "switch") return { stdout: "" };
      if (args[0] === "merge-base") return { stdout: `${args[1]}\n` };
      if (args[0] === "fetch") {
        fetchCount += 1;
        if (fetchCount === 2) throw new Error("second import failed");
        const destination = args.at(-1)!.split(":")[1]!;
        imported.set(destination, afterHeads[0]!);
        return { stdout: "" };
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        if (cleanupFails) throw new Error("candidate cleanup failed");
        deleted.push(args[2]!);
        imported.delete(args[2]!);
        return { stdout: "" };
      }
      if (args[0] === "rev-parse") {
        const ref = args.at(-1)!;
        const tree = ref.endsWith("^{tree}");
        const plain = tree ? ref.slice(0, -"^{tree}".length) : ref;
        const branchIndex = before.members.findIndex((member) => member.ref === plain);
        const head = plain === `refs/heads/${targetName}`
          ? target.head
          : imported.get(plain) ?? (branchIndex >= 0 ? afterHeads[branchIndex]! : plain);
        const value = tree
          ? treeByHead.get(head) ?? before.members.find((member) => member.coordinates?.head === head)?.coordinates?.tree
            ?? target.tree
          : head;
        return { stdout: `${value}\n` };
      }
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };
    let rebased = false;
    const port = new GhDeliveryProviderRefreshPort({
      git,
      gh: {
        run: async (args) => {
          if (args[1] === "--version" || args[1] === "checkout") return { stdout: "", stderr: "" };
          if (args[1] === "view") return { stdout: JSON.stringify(asView(rebased)), stderr: "" };
          if (args[1] === "rebase") {
            rebased = true;
            return { stdout: "", stderr: "" };
          }
          throw new Error(`unexpected gh invocation: ${args.join(" ")}`);
        },
      },
      nativeStack: { observe: async () => ({ status: "registered", stackNumber: 558 }) },
      checkoutPath: "/repo",
      remote: "origin",
      temporaryDirectories: { create: async () => "/tmp/refresh-fixture", remove: async () => undefined },
    });

    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before,
    })).resolves.toEqual({ status: "refused", reason: "unavailable" });
    expect(deleted).toEqual([
      `refs/arc/delivery-refresh-candidates/${plan.planId}/${plan.members[0]!.chunkKey}`,
    ]);

    fetchCount = 0;
    rebased = false;
    cleanupFails = true;
    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before,
    })).resolves.toEqual({ status: "refused", reason: "candidate-cleanup-required" });
  });
});
