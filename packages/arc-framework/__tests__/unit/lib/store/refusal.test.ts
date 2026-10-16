/** Missing state anchors are recoverable values, distinct from malformed change intervals. */
import { describe, expect, it } from "vitest";
import {
  OwnerIdentitySchema, StateVersionSchema, StoreRefusalSchema, recordReferences,
  type StateVersion, type StoreResult,
} from "../../../../src/lib/store/index.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../helpers/schema-assertion.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";

const uid = "11111111-1111-4111-8111-111111111111";
const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid }));
const missing = StateVersionSchema.parse("missing-state");
const common = { code: "state-unresolvable", class: "recoverable", condition: "This clone lacks the requested saved state.",
  remedy: { text: "Read the current saved version and rebuild the query." } };

describe("unresolvable state refusal schema", () => {
  it.each([{ historyRefs: [] }, { historyRefs: [`refs/arc/history/work/${uid}`, `refs/arc/history/cohort/${uid}`] }])(
    "preserves the required history selection $historyRefs", ({ historyRefs }) => {
      const value = { ...common, historyRefs };
      expect(assertSchemaAccepts(StoreRefusalSchema, value)).toEqual(value);
      assertSchemaRefuses(StoreRefusalSchema, { ...value, historyRefs: undefined });
      assertSchemaRefuses(StoreRefusalSchema, { ...value, extra: true });
      assertSchemaRefuses(StoreRefusalSchema, { ...value, class: "terminal" });
    },
  );
  it("retains optional anchor and write-field evidence", () => {
    const value = { ...common, stateVersion: missing, historyRefs: [], reference, field: "sessionVersion" };
    expect(assertSchemaAccepts(StoreRefusalSchema, value)).toEqual(value);
    assertSchemaRefuses(StoreRefusalSchema, { ...value, historyRefs: ["refs/arc/work/example"] });
  });
});

describe("reference saved-state recovery", () => {
  it.each(["read", "list", "changes-from", "changes-to"] as const)("recovers an unknown anchor in %s", async (operation) => {
    const fixture = createReferenceFixture();
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    const current = success(await fixture.store.version());
    const run = (anchor: StateVersion): Promise<StoreResult<unknown>> => {
      if (operation === "read") return fixture.store.read({ reference: record.reference, asOf: anchor });
      if (operation === "list") return fixture.store.list({ family: "work-item", asOf: anchor });
      return fixture.store.changes({ from: operation === "changes-from" ? anchor : current,
        to: operation === "changes-to" ? anchor : current });
    };
    expect(await run(missing)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", stateVersion: missing, historyRefs: [],
    } });
    expect(success(await fixture.store.version())).toBe(current);
    const repaired = success(await run(current));
    if (operation === "read") expect(repaired).toMatchObject({ reference: record.reference, content: record.content });
    else if (operation === "list") expect(repaired).toMatchObject({ status: "complete", records: [{ reference: record.reference }] });
    else expect(repaired).toEqual([]);
  });
  it("keeps a reversed interval between known states distinct from a missing anchor", async () => {
    const fixture = createReferenceFixture();
    const earlier = success(await fixture.store.version());
    await seed(fixture, fixture.reference("work-item/meta"));
    const later = success(await fixture.store.version());
    await expect(fixture.store.changes({ from: later, to: earlier })).rejects.toThrow("Invalid reference changes interval");
  });
  it("produces and repairs the exhaustive conformance case", async () => {
    const fixture = createReferenceFixture();
    const operation = await fixture.produce("state-unresolvable");
    expect(await operation.run()).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable" } });
    await fixture.repair("state-unresolvable");
    expect(success(await operation.run())).toMatchObject({ content: expect.any(String) });
  });
});
