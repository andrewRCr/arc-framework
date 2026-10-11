/** Production task-list fields from real tracked reads and listings. */
import { describe, expect, it } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

describe("tracked task-list fields", () => {
  it("returns the parsed Design from both a read and a listing", async () => {
    const fixture = await createInRepoFixture();
    const content = "# Tasks\n\n- **Design:** `spec-example.md`\n\n- [x] 1.1 Older task\n";
    const record = await seed(fixture, fixture.reference("work-item/task-list"), content);
    expect(record.content).toBe(content);
    expect.soft(record.fields).toEqual({ design: "spec-example.md" });
    const listing = success(await fixture.store.list({ family: "work-item", kind: "work-item/task-list", filter: { heldHere: true } }));
    expect(listing).toMatchObject({ status: "complete", missed: false, diagnostics: [],
      records: [{ fields: { design: "spec-example.md" }, content }] });
  });
});
