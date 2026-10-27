/** Repoint and undo bind the effective receivers, including explicit push URLs and one-step Git rewrites. */
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { switchFixture, createRemoteMover, personal, provenance } from "../helpers/store/remote-move.js";
import { followFixture } from "../helpers/store/follow.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { success } from "../helpers/store/suite-tools.js";

const record = "refs/arc/tmp/migrate/move";
const stop = async (step: string): Promise<void> => { if (step === "backing.repointed") throw new Error("Paused after repoint"); };

it.each([
  { role: "push", pointer: true, spaced: false }, { role: "read", pointer: true, spaced: false },
  { role: "off", pointer: true, spaced: false }, { role: "read", pointer: false, spaced: false },
  { role: "off", pointer: false, spaced: false }, { role: "push", pointer: true, spaced: true },
] as const)("keeps distinct backing transports for a role-only $role setting, pointer=$pointer, spaced=$spaced", async ({ role, pointer, spaced }) => {
  const h = await refSyncFixture("separate"), publication = await refSyncFixture();
  const rawUrl = spaced ? "backing raw alias " : h.origin;
  if (spaced) {
    await h.a.git(["config", "remote.backing.url", rawUrl]);
    await h.a.git(["config", `url.${h.origin}.insteadOf`, rawUrl]);
  }
  await h.a.git(["config", "remote.backing.pushurl", publication.origin]);
  let hasPointer = pointer;
  const ports = { ...h.a.ports, backingRepository: async () => hasPointer ? rawUrl : null };
  const store = createRefStore(ports);
  const reference = RecordReferenceSchema.parse({ ...personal, key: "role-only-receiver.md" });
  success(await store.write({ action: "put", reference, expected: null, content: "Preserved publication receiver.\n", provenance }));
  const transports = () => h.a.git(["config", "--null", "--get-regexp", "^remote\\.backing\\.(url|pushurl|fetch|push)$"]);
  const before = (await transports()).stdout;
  const fetchTips = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect((await invokeStoreRemote(["backing", role, "--json"], { cwd: h.a.root, ports })).result.status).toBe("ok");
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe(role);
  expect((await transports()).stdout).toBe(before);
  expect(success(await store.read({ reference })).content).toBe("Preserved publication receiver.\n");
  hasPointer = true;
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.a.root, ports })).result.status).toBe("ok");
  success(await store.push());
  expect((await publication.remote("git", ["grep", "-F", "Preserved publication receiver.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Preserved publication receiver.");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(fetchTips);
}, 60_000);

it.each(["literal", "source push URL", "rewrite carriage return"] as const)("refuses a line break in the %s transport before contact and resumes after repair", async damage => {
  const h = await switchFixture(damage === "source push URL" ? "backing" : "code", "backing");
  const target = damage === "literal" ? `${h.to}\nextra` : h.to;
  if (damage === "source push URL") await h.a.git(["config", "remote.backing.pushurl", `${h.origin}\nextra`]);
  if (damage === "rewrite carriage return") {
    const config = join(h.a.root, "invalid-transport.gitconfig");
    await h.a.exec("git", ["config", "--file", config, `url.${h.to}\r.insteadOf`, h.to]);
    vi.stubEnv("GIT_CONFIG_GLOBAL", config); onTestFinished(() => { vi.unstubAllEnvs(); });
  }
  let contacts = 0;
  const ports = { ...h.ports, exec: async (command: string, args: string[], options?: Parameters<typeof h.ports.exec>[2]) => {
    if (args.includes("fetch") || args.includes("push")) contacts++;
    return h.ports.exec(command, args, options);
  } };
  expect(await invokeStoreMigrate(["--to", target], ports)).toMatchObject({ status: "refused", refusal: { class: "recoverable",
    condition: expect.stringMatching(/line break/iu), remedy: { text: expect.stringMatching(/restore|repair/iu) } } });
  expect(contacts).toBe(0);
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  if (damage === "source push URL") await h.a.git(["config", "remote.backing.pushurl", h.origin]);
  if (damage === "rewrite carriage return") vi.unstubAllEnvs();
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  success(await h.store.push());
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Pending local state.");
}, 60_000);

it("refuses an ambiguous source push receiver without changing its state and continues after repair", async () => {
  const h = await switchFixture("backing", "backing");
  await h.a.git(["config", "--add", "remote.backing.pushurl", h.origin]);
  await h.a.git(["config", "--add", "remote.backing.pushurl", h.destinationDirectory]);
  const tips = () => h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
  const before = (await tips()).stdout;
  expect(await invokeStoreMigrate(["--to", h.to], h.ports)).toMatchObject({ status: "refused", refusal: {
    code: "role-conflict", class: "recoverable", condition: expect.stringMatching(/multiple.*push/iu),
    remedy: { text: expect.stringMatching(/one push URL/iu) },
  } });
  expect((await tips()).stdout).toBe(before);
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  await h.a.git(["config", "--unset-all", "remote.backing.pushurl"]);
  await h.a.git(["config", "remote.backing.pushurl", h.origin]);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  success(await h.store.push());
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Pending local state.");
}, 60_000);

it.each(["code", "backing"] as const)("copies from %s through a raw alias without rewriting its recorded endpoint twice", async source => {
  const h = await switchFixture(source, "backing"), decoy = join(h.a.root, "double-rewritten.git");
  await h.a.exec("git", ["init", "--bare", decoy]);
  const config = join(h.a.root, "transport.gitconfig"), alias = "arc-destination:";
  for (const [key, value] of [[`url.${h.destinationDirectory}.insteadOf`, alias],
    [`url.${decoy}.insteadOf`, h.destinationDirectory], [`url.${decoy}.pushInsteadOf`, h.destinationDirectory]]) {
    if (!key || !value) throw new Error("Expected a complete rewrite rule");
    await h.a.exec("git", ["config", "--file", config, key, value]);
  }
  vi.stubEnv("GIT_CONFIG_GLOBAL", config); onTestFinished(() => { vi.unstubAllEnvs(); });
  expect((await invokeStoreMigrate(["--to", alias], h.ports)).status).toBe("ok");
  expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(alias);
  expect((await h.a.git(["remote", "get-url", "--push", "--all", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  const reference = RecordReferenceSchema.parse({ ...personal, key: "one-rewrite.md" });
  success(await h.store.write({ action: "put", reference, expected: null, content: "One rewrite to intended receiver.\n", provenance }));
  success(await h.store.push());
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "One rewrite to intended receiver.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("One rewrite to intended receiver.");
  expect((await h.a.exec("git", [`--git-dir=${decoy}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
}, 60_000);

it.each([1, 2])("clears %i inherited push URLs before a repointed move grants publication", async count => {
  const h = await switchFixture("backing", "backing");
  for (let index = 0; index < count; index++) await h.a.git(["config", "--add", "remote.backing.pushurl", h.origin]);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: stop })).rejects.toThrow("Paused after repoint");
  expect((await h.a.git(["remote", "get-url", "--push", "--all", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe("off");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout.trim()).toBe(record);
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const reference = RecordReferenceSchema.parse({ ...personal, key: "after-repoint.md" });
  success(await h.store.write({ action: "put", reference, expected: null, content: "Fresh destination publication.\n", provenance }));
  expect(success(await h.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Fresh destination publication.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Fresh destination publication.");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
}, 60_000);

it.each(["push", "read"] as const)("follows onto the actual destination with role %s after clearing the source push URL", async role => {
  const h = await followFixture(undefined, "backing"), side = h.follower;
  await side.git(["config", "remote.backing.pushurl", h.origin]);
  await expect(invokeStoreRemote(["backing", role, "--json"], { cwd: side.root, ports: { ...side.ports, migrateStep: stop } }))
    .rejects.toThrow("Paused after repoint");
  expect((await side.git(["remote", "get-url", "--push", "--all", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  expect((await side.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe("off");
  expect((await invokeStoreMigrate([], side.ports)).status).toBe("ok");
  expect((await side.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe(role);
  const tips = () => side.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
  const before = (await tips()).stdout;
  success(await side.store.push());
  if (role === "read") expect((await tips()).stdout).toBe(before);
  else expect((await side.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Unpublished follower data.");
  expect(success(await side.store.read({ reference: side.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(["push", "read", "off"] as const)("repoints a direct backing setting without retaining an old push URL (%s)", async role => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture();
  await h.a.git(["config", "remote.backing.pushurl", h.origin]);
  const ports = { ...h.a.ports, backingRepository: async () => destination.origin };
  await expect(invokeStoreRemote(["backing", role, "--json"], { cwd: h.a.root, ports: { ...ports, migrateStep: stop } }))
    .rejects.toThrow("Paused after repoint");
  expect((await h.a.git(["remote", "get-url", "--push", "--all", "backing"])).stdout.trim()).toBe(destination.origin);
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe("off");
  expect((await invokeStoreRemote(["backing", role, "--json"], { cwd: h.a.root, ports })).result.status).toBe("ok");
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe(role);
});

it.each(["read", "off"] as const)("restores a recorded follow's transports at an already-matching raw URL (%s)", async role => {
  const h = await followFixture(undefined, "backing"), side = h.follower;
  const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const ports = { ...side.ports, migrateStep: async (step: string) => {
    if (step === "follow.switch") {
      await side.git(["config", "remote.backing.url", h.destinationDirectory]);
      await side.git(["config", "remote.backing.pushurl", h.origin]);
    }
  } };
  expect((await invokeStoreRemote(["backing", role, "--json"], { cwd: side.root, ports })).result.status).toBe("ok");
  expect((await side.git(["remote", "get-url", "--push", "--all", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  expect(success(await side.store.read({ reference: side.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports: side.ports })).result.status).toBe("ok");
  success(await side.store.push());
  expect((await side.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Unpublished follower data.");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
}, 60_000);

it.each([false, true])("restores distinct recorded source transports through an inverse rewrite (repair needed=%s)", async repairNeeded => {
  const h = await switchFixture("backing", "backing"), effective = `file://${h.origin}`, alias = "arc-source:";
  const decoy = join(h.a.root, "wrong-source.git");
  await h.a.exec("git", ["init", "--bare", decoy]);
  await h.a.git(["config", `url.${effective}.insteadOf`, alias]);
  await h.a.git(["config", `url.file://${decoy}.insteadOf`, effective]);
  await h.a.git(["config", "remote.backing.pushurl", alias]);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: stop })).rejects.toThrow("Paused after repoint");
  const mover = await createRemoteMover(h, h.destinationDirectory, "moving-back");
  expect((await invokeStoreMigrate(["--to", h.origin], mover.ports)).status).toBe("ok");
  if (repairNeeded) {
    await h.a.git(["config", "--unset-all", `url.${effective}.insteadOf`]);
    await h.a.git(["config", "--add", `url.file://${decoy}.insteadOf`, alias]);
    expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "refused", refusal: { class: "recoverable",
      condition: expect.stringMatching(/transport|endpoint|URL/iu), remedy: { text: expect.stringMatching(/repair|restore/iu) } } });
    expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe("off");
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout.trim()).toBe(record);
    expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
    await h.a.git(["config", `url.${effective}.insteadOf`, alias]);
    await h.a.git(["config", "--unset-all", `url.file://${decoy}.insteadOf`, alias]);
  }
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(h.origin);
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.origin);
  expect((await h.a.git(["remote", "get-url", "--push", "--all", "backing"])).stdout.trim()).toBe(effective);
  const reference = RecordReferenceSchema.parse({ ...personal, key: "restored-source.md" });
  success(await h.store.write({ action: "put", reference, expected: null, content: "Restored source publication.\n", provenance }));
  success(await h.store.push());
  expect((await h.remote("git", ["grep", "-F", "Restored source publication.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Restored source publication.");
  expect((await h.a.exec("git", [`--git-dir=${decoy}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
}, 60_000);
