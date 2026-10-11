/** Tracked reads and listings honor the backend's production kind registration. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

const behavior = vi.hoisted(() => ({ reject: false }));
vi.mock("../../src/lib/store/kinds/registrations.js", () => ({
  PRODUCTION_REGISTRATIONS: [{
    kind: "work-item/meta",
    parser: (content: string) => behavior.reject
      ? { success: false, error: "Registration rejected the content" }
      : { success: true, data: { registered: true, bytes: content } },
  }],
}));

beforeEach(() => { behavior.reject = false; });
describe("registered tracked meta decoding", () => {
  it("returns registered fields from both a read and a listing", async () => {
    const fixture = await createInRepoFixture();
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    expect.soft(record.fields).toEqual({ registered: true, bytes: record.content });
    const listed = success(await fixture.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
    expect(listed).toMatchObject({ status: "complete", missed: false, diagnostics: [],
      records: [{ fields: { registered: true, bytes: record.content } }] });
  });
  it("keeps rejected bytes readable and reports the malformed record in a listing", async () => {
    const fixture = await createInRepoFixture();
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    behavior.reject = true;
    const read = success(await fixture.store.read({ reference: record.reference }));
    expect(read.content).toBe(record.content);
    expect.soft(read).not.toHaveProperty("fields");
    const listed = success(await fixture.store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true } }));
    expect(listed).toMatchObject({ status: "complete", records: [], missed: true, diagnostics: [{ kind: "malformed" }] });
  });
});
