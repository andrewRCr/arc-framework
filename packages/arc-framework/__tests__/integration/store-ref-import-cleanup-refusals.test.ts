/** Import source retirement preserves the publisher's refusal identity and continuation. */
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { keptPrefix, seedTransients, transientCommon, transientSourceRef } from "../helpers/store/import-transients.js";

const journal = "refs/arc/tmp/migrate/import-required", claims = "refs/arc/user/andrew/claims";
const verification = ":refs/arc/tmp/migrate/import-published/";

async function seedClaimSource(h: Awaited<ReturnType<typeof importFixture>>): Promise<string> {
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tip = await seedTransients(h, [{ ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha",
    members: ["alpha"], openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  return tip;
}

it.each(["terminal", "recoverable"] as const)("preserves a %s publisher verification refusal and its retained cleanup", async fault => {
  const h = await importFixture("default", { refFormat: "files" });
  expect((await h.git("git", ["rev-parse", "--show-ref-format"])).stdout.trim()).toBe("files");
  const tip = await seedClaimSource(h);
  const common = (await h.git("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"])).stdout.trim();
  const lock = join(common, "refs/arc/tmp/migrate/import-published/user/andrew/claims.lock"), offline = `${h.origin}-offline`;
  const original = h.ports.exec;
  let armed = false, injected = false, keptBefore = "", journalBefore = "";
  h.ports.migrateStep = async step => {
    if (step !== "import.transient.remote-delete") return;
    armed = true;
    keptBefore = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", keptPrefix])).stdout;
    journalBefore = (await h.git("git", ["rev-parse", journal])).stdout;
    expect(JSON.parse((await h.git("git", ["cat-file", "blob", journal])).stdout)).toHaveProperty(claims, expect.any(String));
    expect((await h.remote("git", ["rev-parse", claims])).stdout.trim()).not.toBe("");
    if (fault === "terminal" && !injected) {
      await mkdir(dirname(lock), { recursive: true });
      await writeFile(lock, "Held verification ref lock.\n", { flag: "wx" });
      injected = true;
    }
  };
  h.ports.exec = async (command, args, options) => {
    if (fault === "recoverable" && armed && !injected && args.includes("fetch")
      && typeof options?.input === "string" && options.input.includes(verification)) {
      await rename(h.origin, offline);
      injected = true;
    }
    return original(command, args, options);
  };
  const result = await h.migrate();
  expect(injected).toBe(true);
  expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: fault === "terminal" ? "refused" : "unreachable", class: fault,
    remedy: { argv: ["arc", "store", "migrate", "--import"] },
  } } });
  if (result.status !== "refused" || result.refusal.code !== "store") throw new Error("Expected the original store refusal");
  if (fault === "terminal") {
    expect(result.refusal.refusal.condition).toContain("refs/arc/tmp/migrate/import-published/user/andrew/claims");
    expect(result.refusal.refusal.remedy.text).toContain("temporary ref lock");
  }
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", keptPrefix])).stdout).toBe(keptBefore);
  expect((await h.git("git", ["rev-parse", journal])).stdout).toBe(journalBefore);
  expect((await h.git("git", [`--git-dir=${fault === "recoverable" ? offline : h.origin}`, "rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  if (fault === "terminal") await unlink(lock); else await rename(offline, h.origin);
  h.ports.migrateStep = async () => {};
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", transientSourceRef])).stdout).toBe("");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix, journal])).stdout).toBe("");
}, 60_000);

it("preserves a no-publisher command refusal and its import continuation", async () => {
  const h = await importFixture("separate"), tip = await seedClaimSource(h);
  let injected = false, journalBefore = "";
  h.ports.migrateStep = async step => {
    if (step !== "import.transient.local-delete" || injected) return;
    journalBefore = (await h.git("git", ["rev-parse", journal])).stdout;
    await h.git("git", ["config", "--add", "remote.origin.pushurl", h.origin]);
    await h.git("git", ["config", "--add", "remote.origin.pushurl", `${h.origin}-other`]);
    injected = true;
  };
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: expect.stringContaining("multiple effective push destinations"),
    remedy: { text: expect.stringContaining("Configure one push URL for origin"), argv: ["arc", "store", "migrate", "--import"] } } });
  expect(injected).toBe(true);
  expect((await h.remote("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["rev-parse", journal])).stdout).toBe(journalBefore);
  await h.git("git", ["config", "--unset-all", "remote.origin.pushurl"]);
  h.ports.migrateStep = async () => {};
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix, journal])).stdout).toBe("");
}, 40_000);

it("keeps the restore-access remedy for an unreachable origin with no publisher", async () => {
  const h = await importFixture("separate"), tip = await seedClaimSource(h), offline = `${h.origin}-offline`;
  let injected = false, journalBefore = "";
  h.ports.migrateStep = async step => {
    if (step !== "import.transient.local-delete" || injected) return;
    journalBefore = (await h.git("git", ["rev-parse", journal])).stdout;
    await rename(h.origin, offline);
    injected = true;
  };
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    remedy: { text: expect.stringContaining("Restore access to origin"), argv: ["arc", "store", "migrate", "--import"] } } });
  expect(injected).toBe(true);
  expect((await h.git("git", [`--git-dir=${offline}`, "rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["rev-parse", journal])).stdout).toBe(journalBefore);
  await rename(offline, h.origin);
  h.ports.migrateStep = async () => {};
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix, journal])).stdout).toBe("");
}, 40_000);
