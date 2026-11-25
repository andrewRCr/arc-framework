/** Physical personal paths cannot cross a symlink into excluded machine state. */
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { personalFixture, personalReference, personalDigest, personalProvenance } from "../helpers/store/personal-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["document", "session"] as const)("refuses an ancestor alias for %s reads, writes, removals and batches, then retries after repair", async (role) => {
  const h = await personalFixture();
  const name = role === "session" ? "SESSION-NOTES.md" : "state.md";
  const original = "machine-local bytes\n";
  await h.plant(`.internal/${name}`, original);
  await h.plant("allowed.md", "allowed bytes\n");
  await symlink(h.path(".internal"), h.path("visible"), "junction");
  const reference = role === "session" ? personalReference("personal/session-context", "visible")
    : personalReference("personal/document", `visible/${name}`);
  const allowed = personalReference("personal/document", "allowed.md");
  const results = [
    await h.store.read({ reference }),
    await h.store.write({ action: "put", reference, expected: personalDigest(original), content: "changed\n", provenance: personalProvenance }),
    await h.store.write({ action: "put", reference, expected: null, content: "new\n", provenance: personalProvenance }),
    await h.store.write({ action: "remove", reference, expected: personalDigest(original), provenance: personalProvenance }),
    await h.store.batch({ writes: [
      { action: "put", reference: allowed, expected: personalDigest("allowed bytes\n"), content: "changed allowed\n" },
      { action: "put", reference, expected: personalDigest(original), content: "changed\n" },
    ], provenance: personalProvenance }),
  ];
  for (const result of results) {
    expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable" } });
    if (result.status !== "refused") throw new Error("Expected physical-path refusal");
    expect(result.refusal.condition).toContain("symbolic link");
    expect(result.refusal.remedy.text).toContain("retry");
  }
  expect(await readFile(h.path(`.internal/${name}`), "utf8")).toBe(original);
  expect(success(await h.store.read({ reference: allowed })).content).toBe("allowed bytes\n");
  const listed = success(await h.store.list({ family: "personal" }));
  expect(listed).toMatchObject({ status: "complete", missed: false, records: [{ reference: allowed }] });
  await rm(h.path("visible"));
  await mkdir(h.path("visible"));
  const created = success(await h.store.write({ action: "put", reference, expected: null, content: "ordinary bytes\n", provenance: personalProvenance }));
  expect(success(await h.store.read({ reference })).content).toBe("ordinary bytes\n");
  success(await h.store.write({ action: "remove", reference, expected: created.version!, provenance: personalProvenance }));
  expect(await readFile(join(h.path(".internal"), name), "utf8")).toBe(original);
});

it("refuses a leaf alias before treating it as an absent personal record", async () => {
  const h = await personalFixture();
  await h.plant(".internal/state.md", "excluded bytes\n");
  await symlink(h.path(".internal"), h.path("alias.md"), "junction");
  const reference = personalReference("personal/document", "alias.md");
  expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
  expect(await h.store.write({ action: "put", reference, expected: null, content: "new bytes\n", provenance: personalProvenance }))
    .toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable" } });
  expect(await readFile(h.path(".internal/state.md"), "utf8")).toBe("excluded bytes\n");
});
