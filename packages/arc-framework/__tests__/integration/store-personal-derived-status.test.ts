/** The derived identity-root view is excluded while an ordinary nested namesake is stored. */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { personalFixture, personalReference, personalProvenance } from "../helpers/store/personal-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe("personal derived status admission", () => {
  it("refuses root writes and batches without mutation and admits a nested namesake", async () => {
    const h = await personalFixture();
    await h.plant("STATUS.USER.md", "derived bytes\n");
    const root = personalReference("personal/document", "STATUS.USER.md");
    const nested = personalReference("personal/document", "example/STATUS.USER.md");
    const put = (reference: typeof root) => ({ action: "put" as const, reference, expected: null, content: "ordinary document\n" });
    expect(await h.store.write({ ...put(root), provenance: personalProvenance })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    expect(await h.store.batch({ writes: [put(nested), put(root)], provenance: personalProvenance })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    expect(await readFile(h.path("STATUS.USER.md"), "utf8")).toBe("derived bytes\n");
    await expect(readFile(h.path("example/STATUS.USER.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await h.store.read({ reference: root })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await h.store.write({ ...put(nested), provenance: personalProvenance }));
    expect(success(await h.store.read({ reference: nested })).content).toBe("ordinary document\n");
    expect(success(await h.store.list({ family: "personal", kind: "personal/document" }))).toMatchObject({ status: "complete", records: [{ reference: nested }] });
  });
});
