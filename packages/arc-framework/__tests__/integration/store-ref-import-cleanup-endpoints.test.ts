/** Import cleanup observes and retires the same captured transport endpoint. */
import { expect, it } from "vitest";
import { join } from "node:path";
import { rename } from "node:fs/promises";
import { importFixture } from "../helpers/store/import-fixture.js";
import { keptPrefix, ordinaryErrand, seedTransients, transientSourceRef } from "../helpers/store/import-transients.js";

const publication = "refs/arc/tmp/migrate/import-required";

async function splitOrigin(layout: "default" | "separate") {
  const h = await importFixture(layout);
  const push = join(h.root, "push.git");
  await h.git("git", ["init", "--bare", push]);
  await h.git("git", ["config", "remote.origin.pushurl", push]);
  const tip = await seedTransients(h, [ordinaryErrand]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const refs = async (prefix: string, gitDir?: string) => (await h.git("git", [
    ...gitDir ? [`--git-dir=${gitDir}`] : [], "for-each-ref", "--format=%(refname) %(objectname)", prefix])).stdout;
  expect(await refs(transientSourceRef, h.origin)).toBe("");
  expect(await refs(transientSourceRef, push)).toContain(tip);
  return { ...h, push, tip, refs };
}

it("deletes a retained source present only at origin's push endpoint", async () => {
  const h = await splitOrigin("default");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(await h.refs(transientSourceRef, h.push)).toBe("");
  expect(await h.refs(transientSourceRef, h.origin)).toBe("");
  expect(await h.refs(keptPrefix)).toBe("");
  expect(await h.refs(publication)).toBe("");
});

it("retains cleanup journals when the unpublishing clone cannot inspect origin's push endpoint, then reports it after repair", async () => {
  const h = await splitOrigin("separate");
  let journals = "";
  h.ports.migrateStep = async step => {
    if (step !== "import.transient.local-delete") return;
    journals = await h.refs("refs/arc/tmp/migrate/");
    await rename(h.push, `${h.push}.offline`);
  };
  const refused = await h.migrate();
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable" } });
  expect(journals).toContain(keptPrefix);
  expect(await h.refs("refs/arc/tmp/migrate/")).toBe(journals);
  h.ports.migrateStep = async () => {};
  await rename(`${h.push}.offline`, h.push);
  const retried = await h.migrate();
  expect(retried).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(transientSourceRef),
      remedy: { text: expect.stringContaining(h.push) } }),
  ]) } });
  expect(await h.refs(transientSourceRef, h.push)).toContain(h.tip);
  expect(await h.refs(keptPrefix)).toBe("");
});
