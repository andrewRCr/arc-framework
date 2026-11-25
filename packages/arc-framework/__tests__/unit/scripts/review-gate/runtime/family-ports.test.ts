import { describe, expect, it } from "vitest";
import { bindReviewFamilyPorts } from "../../../../../src/scripts/review-gate/runtime/family-ports.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { LocalApprovedDispositionRecordStore } from "../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import type { GitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import type { Store } from "../../../../../src/lib/store/contract.js";
import { ReviewOwnerSelectionError } from "../../../../../src/lib/store/kinds/review/errors.js";

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

  it("refuses stored ports with no exact work item as a typed selection, and binds them once selected", async () => {
    const { harness, owner, evidence, original, fixture } = await storedLocalApproval();
    const publisher: GitCommonStatePublisher = { list: async () => [], snapshot: async () => [],
      read: async () => null, update: async () => { throw new Error("Unexpected repository write"); } };
    const repository = { dispositions: new LocalApprovedDispositionRecordStore(publisher),
      inFlight: { ...fixture.dependencies.operationStore,
        readOperationSnapshot: async () => ({ status: "complete" as const, records: [...fixture.operations.values()] }) } };
    const unbound = () => bindReviewFamilyPorts({ store: harness.store, publisher, repository });
    expect(unbound).toThrow(ReviewOwnerSelectionError);
    expect(unbound).toThrow(expect.objectContaining({ code: "invalid-input",
      condition: "Binding stored review ports needs the invocation's exact work item.",
      remedy: { text: "Run the command from the work unit's checkout, or continue it from the reference its producer emitted." } }));
    const bound = bindReviewFamilyPorts({ store: harness.store, owner, publisher, repository });
    expect(bound.mode === "stored" && await bound.ports.dispositions.readDispositionRecord(original.operationId))
      .toEqual(await evidence.readDispositionRecord(original.operationId));
  });
});
