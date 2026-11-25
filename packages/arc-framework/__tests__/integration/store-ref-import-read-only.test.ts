/** Local-only imports retain origin authority until the replacement has a state publisher. */
import { expect, it } from "vitest";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { importFixture } from "../helpers/store/import-fixture.js";
import { keptPrefix, seedTransients, transientCommon, transientSourceRef, type TransientIdentityRecord } from "../helpers/store/import-transients.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { success } from "../helpers/store/suite-tools.js";

async function groom(h: Awaited<ReturnType<typeof importFixture>>, identity = "andrew"): Promise<string> {
  const base = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const record: TransientIdentityRecord = { ...transientCommon, kind: "groom", slug: "groom-beta", anchorStub: "beta", members: ["beta"],
    openedBaseHead: base, protection: "partial", branch: null, state: "open", changeRequest: null };
  return seedTransients(h, [record], identity);
}

it.each((["origin-read", "other-read"] as const).flatMap(roles => ([false, true] as const).map(unreadable => ({ roles, unreadable })) ))(
  "retains origin authority with $roles and unreadable=$unreadable", async ({ roles, unreadable }) => {
  const h = await importFixture("separate"), tip = await groom(h);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  if (roles === "origin-read") await h.git("git", ["config", "remote.origin.arc-state", "read"]);
  else {
    await h.git("git", ["remote", "add", "reader", h.origin]);
    await h.git("git", ["config", "remote.reader.arc-state", "read"]);
  }
  if (unreadable) {
    h.ports.migrateStep = async step => { if (step === "import.transient.local-delete") await rename(h.origin, h.origin + ".offline"); };
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
    expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
    h.ports.migrateStep = async () => {};
    await rename(h.origin + ".offline", h.origin);
  }
  const result = await h.migrate();
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Local-only import refused");
  expect.soft((await h.remote("git", ["for-each-ref", "--format=%(objectname)", transientSourceRef])).stdout.trim()).toBe(tip);
  expect.soft(result.result.notices).toContainEqual(expect.objectContaining({ condition: `origin still holds ${transientSourceRef}; no state remote is designated.`,
    remedy: { text: expect.stringContaining("expected-tip lease") } }));
  expect((await h.git("git", [`--git-dir=${join(h.root, ".git/arc/store")}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/claims"])).stdout.trim())
    .toBe("refs/arc/user/andrew/claims");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix])).stdout).toBe("");
}, 30_000);

it("retains required claims if the publisher disappears immediately before source retirement", async () => {
  const h = await importFixture(), tip = await groom(h, "alex"), source = "refs/arc/user/alex/errands";
  await h.git("git", ["push", "origin", `${source}:${source}`]);
  h.ports.migrateStep = async step => { if (step === "import.transient.remote-delete") await h.git("git", ["config", "remote.origin.arc-state", "off"]); };
  const result = await h.migrate();
  expect.soft(result).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining("publisher") } });
  expect.soft((await h.remote("git", ["for-each-ref", "--format=%(objectname)", source])).stdout.trim()).toBe(tip);
  expect.soft((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  h.ports.migrateStep = async () => {};
  await h.git("git", ["config", "remote.origin.arc-state", "push"]);
  const alex = createRefStore({ ...h.ports, identity: async () => SlugSchema.parse("alex") });
  expect(success(await alex.push()).publishes.every(row => row.status !== "failed")).toBe(true);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", source])).stdout).toBe("");
}, 30_000);
