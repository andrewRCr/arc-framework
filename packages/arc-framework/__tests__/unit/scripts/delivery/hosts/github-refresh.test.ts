import { describe, expect, it } from "vitest";
import { makeGitProcessError, scriptGitExec } from "../../../../helpers/git-exec-fake.js";

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
      git: scriptGitExec([
        { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] },
        { match: { prefix: ["rev-parse", "--git-common-dir"] }, responses: [{ stdout: "/repo/.git\n" }] },
      ]).exec,
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

  it("adopts absent refresh candidates and finishes a partially completed cleanup", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const candidates = plan.members.slice(0, 2).map((member, index) => ({
      deliverableId: member.deliverableId,
      ref: `refs/arc/delivery-refresh-candidates/${plan.planId}/${member.chunkKey}`,
      head: oid(String(index + 4)),
    }));
    const refs = new Map([[candidates[1]!.ref, candidates[1]!.head]]);
    const calls: Array<{ readonly args: readonly string[]; readonly cwd: string | undefined }> = [];
    const git: GitExec = async (_command, args, options) => {
      calls.push({ args: [...args], cwd: options?.cwd });
      if (args[0] === "rev-parse") {
        const subject = args.at(-1)!;
        const ref = subject.slice(0, -"^{commit}".length);
        const head = refs.get(ref);
        if (head === undefined) {
          throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "" });
        }
        return { stdout: `${head}\n` };
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        expect(refs.get(args[2]!)).toBe(args[3]);
        refs.delete(args[2]!);
        return { stdout: "" };
      }
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };
    const port = new GhDeliveryProviderRefreshPort({
      git,
      gh: { run: async () => { throw new Error("unused"); } },
      nativeStack: { observe: async () => ({ status: "unsupported" }) },
      checkoutPath: "/repo",
      remote: "origin",
    });

    await expect(port.cleanup(candidates)).resolves.toEqual({ status: "cleaned" });
    await expect(port.cleanup(candidates)).resolves.toEqual({ status: "cleaned" });
    expect(calls.filter(({ args }) => args[0] === "update-ref").map(({ args }) => args.slice(2)))
      .toEqual([[candidates[1]!.ref, candidates[1]!.head]]);
    expect(calls.every(({ cwd }) => cwd === "/repo")).toBe(true);
  });

  it("imports dependent refresh candidates without granting provider push authority", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        coordinates: index === 0 && member.coordinates !== null
          ? { ...member.coordinates, head: oid("a"), tree: oid("b") }
          : member.coordinates,
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
    const advancedTarget = { head: oid("c"), tree: oid("d") };
    const targetName = before.target!.ref.replace(/^refs\/heads\//u, "");
    const afterHeads = before.members.map((member, index) => index === 0
      ? member.coordinates!.head
      : oid(String(index + 7)));
    const afterTrees = before.members.map((member, index) => index === 0
      ? member.coordinates!.tree
      : oid(String(index + 3)));
    let drift = false;
    let baseDrift = false;
    let targetAdvanced = false;
    const currentTarget = () => targetAdvanced ? advancedTarget : target;
    const asView = (after: boolean): GhStackView => ({
      trunk: targetName,
      currentBranch: before.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
      branches: before.members.map((member, index) => ({
        name: drift && index === 0 ? "delivery/unexpected" : member.ref!.replace(/^refs\/heads\//u, ""),
        head: after ? afterHeads[index]! : member.coordinates!.head,
        base: baseDrift && index === 1
          ? oid("f")
          : after
            ? index === 0 ? currentTarget().head : afterHeads[index - 1]!
            : index === 0 ? currentTarget().head : before.members[index - 1]!.coordinates!.head,
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
    let unavailable = false;
    let selectedTransition: "unseeded" | "old" | "current" = "unseeded";
    let recordedPredecessor = before.members[1]!.coordinates!.base;
    let transitionBoundary = recordedPredecessor;
    let recordedPredecessorContained = true;
    let forkBoundaries: readonly string[] = [recordedPredecessor];
    const rebaseCalls: string[][] = [];
    const imported = new Map<string, string>();
    const treeByHead = new Map<string, string>([
      [target.head, target.tree],
      [advancedTarget.head, advancedTarget.tree],
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
      if (args[0] === "update-ref" && args[1] === "-m") {
        const selectedRef = before.members[0]!.ref!;
        const selectedHead = before.members[0]!.coordinates!.head;
        if (args[3] !== selectedRef) throw new Error("unexpected selected transition ref");
        if (selectedTransition === "unseeded" && args[4] === transitionBoundary && args[5] === selectedHead) {
          selectedTransition = "old";
          return { stdout: "" };
        }
        if (selectedTransition === "old" && args[4] === selectedHead && args[5] === transitionBoundary) {
          selectedTransition = "current";
          return { stdout: "" };
        }
        throw new Error("unexpected selected transition coordinates");
      }
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
      if (args[0] === "merge-base") {
        if (args[1] === target.head && args[2] === advancedTarget.head) return { stdout: `${target.head}\n` };
        if (args[1] === recordedPredecessor && args[2] === before.members[1]!.coordinates!.head) {
          return { stdout: `${recordedPredecessorContained ? recordedPredecessor : forkBoundaries[0] ?? ""}\n` };
        }
        if (args[1] === "--all" && args[2] === before.members[0]!.coordinates!.head
          && args[3] === before.members[1]!.coordinates!.head) {
          if (forkBoundaries.length === 0) {
            throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "no common fork boundary" });
          }
          return { stdout: `${forkBoundaries.join("\n")}\n` };
        }
        throw new Error("unexpected target ancestry query");
      }
      if (args[0] === "rev-parse") {
        const ref = args.at(-1)!;
        const tree = ref.endsWith("^{tree}");
        const commit = ref.endsWith("^{commit}");
        const plain = tree
          ? ref.slice(0, -"^{tree}".length)
          : commit ? ref.slice(0, -"^{commit}".length) : ref;
        if (commit && plain.startsWith("refs/arc/delivery-refresh-candidates/") && !imported.has(plain)) {
          throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "" });
        }
        const head = plain === `refs/heads/${targetName}`
          ? currentTarget().head
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
          if (unavailable) {
            throw new DeliveryProviderProcessError("refresh unavailable", {
              stdout: "",
              stderr: `could not determine the previous base\nrebase this branch manually\n${"x".repeat(2_000)}`,
              exitCode: 1,
            });
          }
          if (args.includes("--no-trunk") && selectedTransition !== "current") {
            throw new DeliveryProviderProcessError(
              "could not determine the previous base",
              { stdout: "", stderr: "rebase this branch manually", exitCode: 1 },
            );
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
        create: async () => {
          selectedTransition = "unseeded";
          return "/tmp/refresh-fixture";
        },
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

    const staleRecordedPredecessor = oid("e");
    const recoveredForkBoundary = oid("6");
    const staleBefore = {
      ...before,
      members: before.members.map((member, index) => index === 1 && member.coordinates !== null
        ? { ...member, coordinates: { ...member.coordinates, base: staleRecordedPredecessor } }
        : member),
    };
    recordedPredecessor = staleRecordedPredecessor;
    transitionBoundary = recoveredForkBoundary;
    recordedPredecessorContained = false;
    forkBoundaries = [recoveredForkBoundary];
    rebased = false;
    const recovered = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
      before: staleBefore,
    });
    expect(recovered.status).toBe("prepared");
    expect(selectedTransition).toBe("current");

    for (const { boundaries, detail } of [
      {
        boundaries: [] as readonly string[],
        detail: "The selected member and first dependent do not have a usable fork boundary.",
      },
      {
        boundaries: [oid("5"), oid("6")],
        detail: "The selected member and first dependent do not have one unambiguous fork boundary.",
      },
    ]) {
      forkBoundaries = boundaries;
      rebased = false;
      const rebaseCount = rebaseCalls.length;
      await expect(port.prepare({
        plan,
        repository: "owner/repo",
        scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
        before: staleBefore,
      })).resolves.toEqual({
        status: "refused",
        reason: "scope-mismatch",
        detail,
      });
      expect(rebaseCalls).toHaveLength(rebaseCount);
    }
    recordedPredecessor = before.members[1]!.coordinates!.base;
    transitionBoundary = recordedPredecessor;
    recordedPredecessorContained = true;
    forkBoundaries = [recordedPredecessor];

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
      ["stack", "rebase", "--upstack", "--no-trunk"],
      ["stack", "rebase", "--upstack"],
    ]);

    rebased = false;
    targetAdvanced = true;
    const dependentAppendOnlyTarget = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
      before,
    });
    if (dependentAppendOnlyTarget.status === "refused") {
      throw new Error(dependentAppendOnlyTarget.reason);
    }
    expect(dependentAppendOnlyTarget.observation).toMatchObject({
      targetMovement: "append-only",
      snapshot: {
        target: { ref: before.target!.ref, coordinates: advancedTarget },
      },
    });
    expect(dependentAppendOnlyTarget.observation.snapshot.members[0]?.coordinates).toMatchObject({
      base: advancedTarget.head,
      head: before.members[0]!.coordinates!.head,
      tree: before.members[0]!.coordinates!.tree,
    });

    rebased = false;
    const appendOnlyTarget = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before,
    });
    if (appendOnlyTarget.status === "refused") throw new Error(appendOnlyTarget.reason);
    expect(appendOnlyTarget.observation).toMatchObject({
      targetMovement: "append-only",
      snapshot: {
        target: { ref: before.target!.ref, coordinates: advancedTarget },
      },
    });
    expect(appendOnlyTarget.observation.snapshot.members[0]?.coordinates?.base).toBe(advancedTarget.head);
    targetAdvanced = false;

    rebased = false;
    conflict = true;
    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
      before,
    })).resolves.toEqual({
      status: "refused",
      reason: "conflict",
      detail: "The provider reported a conflict without a recoverable Git rebase state.",
    });
    conflict = false;
    unavailable = true;
    const unavailableResult = await port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: before.members[0]!.deliverableId },
      before,
    });
    expect(unavailableResult).toMatchObject({
      status: "refused",
      reason: "unavailable",
    });
    if (unavailableResult.status !== "refused") throw new Error("provider failure must refuse");
    expect(unavailableResult.detail).toMatch(/^could not determine the previous base rebase this branch manually/u);
    expect(unavailableResult.detail?.length).toBeLessThanOrEqual(1_000);
    unavailable = false;
    drift = true;
    await expect(port.prepare({
      plan,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      before,
    })).resolves.toEqual({ status: "refused", reason: "scope-mismatch" });
    drift = false;
    baseDrift = true;
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
        base: after
          ? index === 0 ? target.head : afterHeads[index - 1]!
          : index === 0 ? target.head : before.members[index - 1]!.coordinates!.head,
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
        if (fetchCount === 2) {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "second import failed" });
        }
        const destination = args.at(-1)!.split(":")[1]!;
        imported.set(destination, afterHeads[0]!);
        return { stdout: "" };
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        if (cleanupFails) {
          throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "candidate cleanup failed" });
        }
        deleted.push(args[2]!);
        imported.delete(args[2]!);
        return { stdout: "" };
      }
      if (args[0] === "rev-parse") {
        const ref = args.at(-1)!;
        const tree = ref.endsWith("^{tree}");
        const commit = ref.endsWith("^{commit}");
        const plain = tree
          ? ref.slice(0, -"^{tree}".length)
          : commit ? ref.slice(0, -"^{commit}".length) : ref;
        if (commit && plain.startsWith("refs/arc/delivery-refresh-candidates/") && !imported.has(plain)) {
          throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "" });
        }
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
