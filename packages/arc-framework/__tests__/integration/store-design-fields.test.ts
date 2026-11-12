/** Real tracked reads and listings expose Purpose only for registered design kinds. */
import { describe, expect, it } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

const purpose = "A first sentence. A second sentence.";
const content = `# Design\n\n**Purpose:** ${purpose}\n`;

describe("tracked design fields", () => {
  it.each(["work-item/draft", "work-item/spec", "work-item/companion"] as const)("reads and lists %s with its full Purpose", async (kind) => {
    const fixture = await createInRepoFixture();
    const record = await seed(fixture, fixture.reference(kind), content);
    expect(record.content).toBe(content);
    expect.soft(record.fields).toEqual({ purpose });
    const listing = success(await fixture.store.list({ family: "work-item", kind, filter: { heldHere: true } }));
    expect(listing).toMatchObject({ status: "complete", missed: false, diagnostics: [], records: [{ content, fields: { purpose } }] });
  });

  it("reads and lists notes as content without fields", async () => {
    const fixture = await createInRepoFixture();
    const record = await seed(fixture, fixture.reference("work-item/notes"), content);
    expect(record.content).toBe(content);
    expect(record).not.toHaveProperty("fields");
    const listing = success(await fixture.store.list({ family: "work-item", kind: "work-item/notes", filter: { heldHere: true } }));
    expect(listing).toMatchObject({ status: "complete", missed: false, diagnostics: [], records: [{ content }] });
    if (listing.status !== "complete") throw new Error("Expected a complete notes listing.");
    expect(listing.records[0]).not.toHaveProperty("fields");
  });
});
