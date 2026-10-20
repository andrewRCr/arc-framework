import { describe, expect, it } from "vitest";
import { bindReviewFamilyPorts } from "../../../../../src/scripts/review-gate/runtime/family-ports.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { LocalApprovedDispositionRecordStore } from "../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import type { GitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import type { Store } from "../../../../../src/lib/store/contract.js";

describe("review family binding", () => {
  it("uses the injected backend's evidence on its selected work item", async () => {
    const { harness, owner, evidence, original, fixture } = await storedLocalApproval();
    const publisher: GitCommonStatePublisher = { list: async () => [], snapshot: async () => [],
      read: async () => null, update: async () => { throw new Error("Unexpected repository write"); } };
    const repository = { dispositions: new LocalApprovedDispositionRecordStore(publisher),
      inFlight: { ...fixture.dependencies.operationStore,
        readOperationSnapshot: async () => ({ status: "complete" as const, records: [...fixture.operations.values()] }) } };
    const bound = bindReviewFamilyPorts({ store: harness.store, owner, publisher, repository });
    expect(bound.mode).toBe("stored");
    expect(await bound.ports.dispositions.readDispositionRecord(original.operationId))
      .toEqual(await evidence.readDispositionRecord(original.operationId));
  });

  it.each(["absent", "in-repo"] as const)("retains native repository approvals with an %s store", async (mode) => {
    const { harness, owner, original, fixture } = await storedLocalApproval();
    const publisher: GitCommonStatePublisher = { list: async () => [], snapshot: async () => [],
      read: async () => JSON.stringify(original), update: async () => { throw new Error("Unexpected repository write"); } };
    const repository = { dispositions: new LocalApprovedDispositionRecordStore(publisher),
      inFlight: { ...fixture.dependencies.operationStore,
        readOperationSnapshot: async () => ({ status: "complete" as const, records: [...fixture.operations.values()] }) } };
    const store = mode === "absent" ? undefined : new Proxy<Store>(harness.store, {
      get(target, property, receiver) {
        return property === "capabilities" ? { stateOffBranch: false } : Reflect.get(target, property, receiver);
      },
    });
    const bound = bindReviewFamilyPorts({ store, owner, publisher, repository });
    expect(await bound.ports.dispositions.readDispositionRecord(original.operationId)).toEqual(original);
    expect(bound.mode).toBe("in-repo");
  });
});
