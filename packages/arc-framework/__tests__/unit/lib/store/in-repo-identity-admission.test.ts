/** Missing identity precedes capability limits without observing unrelated Git state. */
import { describe, expect, it } from "vitest";
import { createStore } from "../../../../src/lib/store/create.js";
import { SlugSchema } from "../../../../src/lib/kernel/schema/slug.js";
import { OwnerIdentitySchema, recordReferences, StateVersionSchema } from "../../../../src/lib/store/identity.js";
import { testStorePorts } from "../../../helpers/store/in-repo-ports.js";

const unavailable = async (): Promise<never> => { throw new Error("Identity admission must precede Git and file observation"); };
const person = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
const item = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
const asOf = StateVersionSchema.parse("a".repeat(40));
const references = [recordReferences["personal/document"](person, "notes.md"), recordReferences["claims/groom"](person, "example"), recordReferences["work-item/record"](item)];

describe("identity admission precedence", () => {
  it.each(references)("refuses missing identity before read/asOf/history/changes limits for $kind", async (reference) => {
    const store = createStore(testStorePorts("/unavailable", unavailable, unavailable));
    const missing = { status: "refused", refusal: { code: "not-found", remedy: { text: expect.stringContaining("arc.identity") } } };
    expect(await store.read({ reference })).toMatchObject(missing);
    expect(await store.read({ reference, asOf })).toMatchObject(missing);
    expect(await store.history({ reference })).toMatchObject(missing);
    expect(await store.changes({ from: asOf, to: asOf, references: [reference] })).toMatchObject(missing);
  });
  it.each([
    { family: "personal", kind: "personal/document" },
    { family: "claims", kind: "claims/groom" },
    { family: "work-item", kind: "work-item/record" },
    { family: "personal" },
    { family: "claims" },
  ] as const)("lists missing identity as absent before asOf limits for $family/$kind", async (selection) => {
    const store = createStore(testStorePorts("/unavailable", unavailable, unavailable));
    expect(await store.list(selection)).toEqual({ status: "ok", result: { status: "absent" } });
    expect(await store.list({ ...selection, asOf })).toEqual({ status: "ok", result: { status: "absent" } });
  });
  it.each(references)("keeps configured-identity historical and changes limits for $kind", async (reference) => {
    const ports = testStorePorts("/unavailable", unavailable, unavailable);
    ports.identity = async () => SlugSchema.parse("andrew");
    const store = createStore(ports);
    const unsupported = { status: "refused", refusal: { code: "unsupported", case: "uncovered-state-version" } };
    expect(await store.read({ reference, asOf })).toMatchObject(unsupported);
    expect(await store.changes({ from: asOf, to: asOf, references: [reference] })).toMatchObject(unsupported);
    if (reference.kind === "personal/document") expect(await store.history({ reference })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "personal-history" } });
  });
  it.each([{ family: "personal", kind: "personal/document" }, { family: "claims", kind: "claims/groom" }, { family: "work-item", kind: "work-item/record" }] as const)("keeps configured-identity saved listing unsupported for $kind", async (selection) => {
    const ports = testStorePorts("/unavailable", unavailable, unavailable);
    ports.identity = async () => SlugSchema.parse("andrew");
    expect(await createStore(ports).list({ ...selection, asOf })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "uncovered-state-version" } });
  });
  it("leaves tracked held-here listing lazy about identity", async () => {
    const ports = testStorePorts("/unavailable", unavailable, unavailable);
    ports.identity = unavailable;
    ports.fs.readdir = async () => [];
    expect(await createStore(ports).list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } })).toEqual({ status: "ok", result: { status: "absent" } });
  });
});
