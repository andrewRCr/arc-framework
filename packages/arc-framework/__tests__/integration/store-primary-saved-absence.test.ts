/** Historical absence follows the selected live branch rather than later creation. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

async function fixture() {
  const h = await trackedWriteFixture();
  await h.exec("git", ["commit", "--allow-empty", "-m", "empty anchor"]);
  const asOf = success(await h.store.version());
  const reference = h.reference("work-item/meta");
  const create = async (branch: string) => {
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    const content = makeMetaFixture("example", { branch });
    success(await h.store.write({ action: "put", reference, expected: null, content, placement: { kind: "active" }, provenance: { verb: "test", lifecycleAction: "create" } }));
    await h.exec("git", ["add", ".arc"]);
    await h.exec("git", ["commit", "-m", "create primary"]);
    return content;
  };
  return { ...h, asOf, primary: reference, create };
}
describe("saved primary absence", () => {
  it("keeps the exact saved absence unchanged after successful same-branch creation", async () => {
    const h = await fixture();
    const before = await h.store.read({ reference: h.primary, asOf: h.asOf });
    expect(before).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const content = await h.create("main");
    expect(await h.store.read({ reference: h.primary, asOf: h.asOf })).toEqual(before);
    expect(success(await h.store.read({ reference: h.primary })).content).toBe(content);
  });
  it("refuses a material foreign-branch primary while preserving exact missing-companion absence", async () => {
    const h = await fixture();
    await h.exec("git", ["checkout", "-b", "feat/example"]);
    const content = await h.create("feat/example");
    await h.exec("git", ["checkout", "main"]);
    expect(await h.store.read({ reference: h.primary, asOf: h.asOf })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "uncovered-state-version" } });
    expect(await h.store.read({ reference: h.reference("work-item/notes"), asOf: h.asOf })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.store.read({ reference: h.primary })).content).toBe(content);
  });
});
