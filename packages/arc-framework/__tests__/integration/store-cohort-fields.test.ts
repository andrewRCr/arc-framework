/** Registered cohort fields and named malformed diagnostics from the real tracked store. */
import { describe, expect, it } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

describe("tracked cohort fields", () => {
  it("reads and lists the cohort's Purpose and Parent", async () => {
    const fixture = await createInRepoFixture();
    const content = "# Cohort\n\n**Parent:** [none]\n\n**Purpose:** Full thesis. Next sentence.\n";
    const record = await seed(fixture, fixture.reference("cohort/document"), content);
    expect.soft(record.fields).toEqual({ purpose: "Full thesis. Next sentence.", parent: null });
    const listing = success(await fixture.store.list({ family: "cohort", kind: "cohort/document" }));
    expect(listing).toMatchObject({ status: "complete", missed: false, diagnostics: [], records: [{ fields: {
      purpose: "Full thesis. Next sentence.", parent: null,
    } }] });
  });

  it("keeps rejected content readable and lists a malformed diagnostic naming it", async () => {
    const fixture = await createInRepoFixture();
    const reference = fixture.reference("cohort/document");
    const content = "# Cohort\n\n**Parent:** bare-parent\n\n**Purpose:** Real\n";
    const record = await seed(fixture, reference, content);
    expect(record.content).toBe(content);
    expect(record).not.toHaveProperty("fields");
    const listing = success(await fixture.store.list({ family: "cohort", kind: "cohort/document" }));
    expect(listing).toMatchObject({ status: "complete", records: [], missed: true,
      diagnostics: [{ kind: "malformed", key: expect.stringContaining(reference.owner.name) }] });
  });
});
