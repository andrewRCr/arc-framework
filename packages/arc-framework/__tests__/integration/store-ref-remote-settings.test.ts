/** Explicit remote role settings through the ref-store command entry. */

import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefStore, runStoreRemote } from "../../src/lib/store/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { success } from "../helpers/store/suite-tools.js";
import { refCarryFixture, carriedBranch, carriedDocument } from "../helpers/store/ref-carry.js";

const provenance = { verb: "start", lifecycleAction: "seed" };
const localId = "34567890-1234-4234-8234-123456789abc";
const foreignId = "45678901-1234-4234-8234-123456789abc";
const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });

it.each(["default", "separate"] as const)("shows roles and the actual %s layout without changing configuration or state", async (layout) => {
  const h = await refSyncFixture(layout);
  const config = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
  const refs = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const viewed = await runStoreRemote(h.a.ports);
  expect(viewed.status, JSON.stringify(viewed)).toBe("ok");
  if (viewed.status !== "ok") throw new Error("Remote view refused");
  expect(viewed.result).toMatchObject({ layout, remotes: expect.arrayContaining([
    { name: "origin", url: h.origin, repository: "code", ...layout === "default" ? { role: "push" } : {} },
    ...layout === "separate" ? [{ name: "backing", url: h.origin, repository: "backing", role: "push" }] : [],
  ]) });
  expect(viewed.result.report).toBeUndefined();
  expect((await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(refs);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});

it("keeps a reserved code remote named backing out of a code push setting's layout decision", async () => {
  const h = await refSyncFixture();
  await h.a.exec("git", ["remote", "add", "backing", h.origin]);
  await h.a.exec("git", ["config", "remote.backing.arc-state", "push"]);
  expect(await runStoreRemote(h.a.ports, { remote: "origin", role: "push" })).toMatchObject({ status: "ok", result: { layout: "default" } });
  await expect(h.a.ports.fs.lstat(`${h.a.root}/.git/arc/store`)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses a code push that would activate another push hidden by an off backing", async () => {
  const h = await refSyncFixture("separate");
  await h.a.git(["config", "remote.backing.arc-state", "off"]);
  await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
  await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  const refused = await runStoreRemote(h.a.ports, { remote: "origin", role: "push" });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "role-conflict", condition: expect.stringContaining("upstream") } });
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.origin);
  expect((await runStoreRemote(h.a.ports, { remote: "upstream", role: "off" })).status).toBe("ok");
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "push" })).status).toBe("ok");
});

it("keeps another check's advanced temporary tip while refusing the project its own fetch observed", async () => {
  const h = await refSyncFixture(), foreign = await refSyncFixture();
  for (const [checkout, id] of [[h.a, localId], [foreign.a, foreignId]] as const) {
    success(await checkout.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: id }), provenance }));
    success(await checkout.store.push());
  }
  const localTip = (await h.a.git(["rev-parse", "refs/arc/project/registry"])).stdout;
  await h.a.exec("git", ["remote", "set-url", "origin", foreign.origin]);
  const temporary = "refs/arc/tmp/designate/origin/registry";
  let armed = true;
  const result = await runStoreRemote({ ...h.a.ports, exec: async (command, args, options) => {
    const fetched = await h.a.ports.exec(command, args, options);
    if (armed && args.includes("fetch") && args.some((arg) => arg.includes("refs/arc/tmp/designate/"))) {
      armed = false;
      await h.a.git(["update-ref", temporary, localTip]);
    }
    return fetched;
  } }, { remote: "origin", role: "push" });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "identity-mismatch", actual: { owner: { uid: foreignId } },
  } } });
  expect((await h.a.git(["rev-parse", temporary])).stdout).toBe(localTip);
  await h.a.git(["update-ref", "-d", temporary]);
  await h.a.exec("git", ["remote", "set-url", "origin", h.origin]);
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "push" })).status).toBe("ok");
});

it("refuses a push repoint of backing without changing its URL, role or state", async () => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture();
  const config = (await h.a.git(["config", "--null", "--list", "--local"])).stdout;
  expect(await runStoreRemote({ ...h.a.ports, backingRepository: async () => destination.origin }, { remote: "backing", role: "push" }))
    .toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
  expect((await h.a.git(["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect((await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" })).status).toBe("ok");
});

it.each(["off", "read", "undesignated", "absent"] as const)("publishes through the code remote after removing a %s backing with no pointer", async (role) => {
  const h = await refCarryFixture("separate");
  if (role === "absent") await h.a.git(["remote", "remove", "backing"]);
  else if (role === "undesignated") await h.a.git(["config", "--unset", "remote.backing.arc-state"]);
  else await h.a.git(["config", "remote.backing.arc-state", role]);
  const before = success(await h.a.store.version());
  expect(await runStoreRemote(h.a.ports, { remote: "origin", role: "push" })).toMatchObject({ status: "ok", result: {
    layout: "default", remotes: [{ name: "origin", role: "push", repository: "code", url: h.origin }],
  } });
  expect(success(await h.a.store.version())).toBe(before);
  expect(success(await h.a.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  expect(success(await h.a.store.pull()).states).toEqual([]);
});

it("reports the recorded move it finishes as well as the new setting's reverse move", async () => {
  const h = await refCarryFixture("default");
  await expect(runStoreRemote({ ...h.a.ports, migrateStep: async (step) => {
    if (step === "layout.rename") throw new Error("Interrupted before switch");
  } }, { remote: "origin", role: "off" })).rejects.toThrow("Interrupted before switch");
  const result = await runStoreRemote(h.a.ports, { remote: "origin", role: "push" });
  expect(result).toMatchObject({ status: "ok", result: { layout: "default" } });
  if (result.status !== "ok") throw new Error("Setting refused");
  expect(result.result.report?.refs.filter(({ ref }) => ref === "refs/arc/user/andrew/personal")).toEqual([
    { ref: "refs/arc/user/andrew/personal", scope: "identity", person: "andrew", action: "copy" },
    { ref: "refs/arc/user/andrew/personal", scope: "identity", person: "andrew", action: "copy" },
  ]);
  expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
});

it.each(["off", "read"] as const)("sets an existing backing %s in place with no pointer and refuses a later repoint", async (role) => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "kept.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Kept.\n", provenance }));
  const refs = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await runStoreRemote(h.a.ports, { remote: "backing", role })).toMatchObject({ status: "ok", result: {
    layout: "separate", remotes: expect.arrayContaining([{ name: "backing", role, repository: "backing", url: h.origin }]),
  } });
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(refs);
  const config = (await h.a.git(["config", "--null", "--list", "--local"])).stdout;
  const repointed = await runStoreRemote({ ...h.a.ports, backingRepository: async () => destination.origin }, { remote: "backing", role });
  expect(repointed).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
  expect((await h.a.git(["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(refs);
  expect(success(await h.a.store.read({ reference })).content).toBe("Kept.\n");
  expect((await runStoreRemote(h.a.ports, { remote: "backing", role })).status).toBe("ok");
});

it("installs a first backing in an empty local-only clone without altering its code remotes", async () => {
  const h = await refSyncFixture();
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const config = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
  const result = await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" });
  expect(result).toMatchObject({ status: "ok", result: { layout: "separate", remotes: expect.arrayContaining([
    { name: "backing", repository: "backing", role: "push", url: h.origin },
  ]) } });
  expect((await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect(success(await h.a.store.pull()).states).toEqual([]);
});

it.each(["fetch-and-push", "pushurl", "backing-off"] as const)("designates a fork's upstream in a separate store using its %s URLs while carrying code to the fork", async (mode) => {
  const h = await refCarryFixture(mode === "backing-off" ? "separate" : "default"), upstream = await refSyncFixture();
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  if (mode === "backing-off") expect((await runStoreRemote(h.a.ports, { remote: "backing", role: "off" })).status).toBe("ok");
  await h.a.exec("git", ["remote", "add", "upstream", "arc-state-upstream:"]);
  await h.a.exec("git", ["config", `url.${upstream.origin}.insteadOf`, "arc-state-upstream:"]);
  const target = mode === "pushurl" ? upstream.b.root : upstream.origin;
  if (mode === "pushurl") await h.a.exec("git", ["remote", "set-url", "--push", "upstream", target]);
  const made = success(await upstream.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({
    kind: "project-inbox/inbox", owner: { type: "project", name: "project" },
  }), expected: null, content: "# Atomic Inbox\n", provenance }));
  success(await upstream.a.store.push());
  const set = await runStoreRemote(h.a.ports, { remote: "upstream", role: "push" });
  expect(set).toMatchObject({ status: "ok", result: { layout: "separate" } });
  expect(success(await h.a.store.pull()).pulls).toContainEqual(expect.objectContaining({ remote: "upstream", role: "state", status: "pulled" }));
  expect(success(await h.a.store.read({ reference: made.reference })).content).toBe("# Atomic Inbox\n");
  const pushed = success(await h.a.store.push({ carry: { ref: carriedBranch } }));
  expect(pushed.carry).toMatchObject({ status: "pushed" });
  expect(pushed.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
  expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout).toBe(h.code.tip);
  const receiver = mode === "pushurl" ? upstream.b.exec : upstream.remote;
  expect((await receiver("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout).toBe((await h.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout);
  expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});

it("shows and changes code remote roles that backing excludes from synchronization candidates", async () => {
  const h = await refSyncFixture("separate");
  await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
  await h.a.exec("git", ["config", "remote.upstream.arc-state", "off"]);
  expect(await runStoreRemote(h.a.ports)).toMatchObject({ status: "ok", result: { remotes: expect.arrayContaining([
    { name: "upstream", role: "off", url: h.origin, repository: "code" },
  ]) } });
  expect((await runStoreRemote(h.a.ports, { remote: "upstream", role: "read" })).status).toBe("ok");
  expect((await h.a.exec("git", ["config", "remote.upstream.arc-state"])).stdout).toBe("read");
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("push");
  expect((await runStoreRemote(h.a.ports, { remote: "upstream", role: "off" })).status).toBe("ok");
});

it.each(["push", "held", "edited"] as const)("refuses a backing setting while the code layout is %s", async (mode) => {
  const h = await refSyncFixture();
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: localId }), provenance }));
  if (mode === "held") await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  if (mode === "edited") {
    await h.a.exec("git", ["remote", "add", "fork", h.origin]);
    await h.a.exec("git", ["config", "remote.pushDefault", "fork"]);
    await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  }
  const config = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
  const refused = await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: mode === "push" ? "role-conflict" : "move-incomplete",
    remedy: { text: expect.stringContaining("arc store migrate") } } });
  expect((await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout).toBe(config);
  await expect(h.a.ports.fs.lstat(`${h.a.root}/.git/arc/store`)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "origin", role: "off" })).status).toBe("ok");
  expect((await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" })).status).toBe("ok");
});

it.each([false, true])("refuses backing push without a pointer and names the reserved code remote's repair (existing backing: %s)", async (existing) => {
  const h = await refSyncFixture("separate");
  if (!existing) await h.a.git(["remote", "remove", "backing"]);
  await h.a.exec("git", ["remote", "add", "backing", h.origin]);
  const config = (await h.a.git(["config", "--null", "--list", "--local"])).stdout;
  const refused = await runStoreRemote(h.a.ports, { remote: "backing", role: "push" });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "role-conflict", remedy: {
    text: expect.stringContaining("git remote rename backing"), argv: ["git", "remote", "rename", "backing", "state-source"],
  } } });
  expect((await h.a.git(["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" })).status).toBe("ok");
});

it("checks a first backing's project before installing its directory or remote", async () => {
  const h = await refSyncFixture(), foreign = await refSyncFixture();
  for (const [checkout, id] of [[h.a, localId], [foreign.a, foreignId]] as const) {
    success(await checkout.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: id }), provenance }));
    success(await checkout.store.push());
  }
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  const config = (await h.a.git(["config", "--null", "--list", "--local"])).stdout;
  const refused = await runStoreRemote({ ...h.a.ports, backingRepository: async () => foreign.origin }, { remote: "backing", role: "push" });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch",
    expected: { owner: { uid: localId } }, actual: { owner: { uid: foreignId } } } } });
  expect((await h.a.git(["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" })).status).toBe("ok");
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.origin);
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("push");
  expect(success(await h.a.store.pull()).states).toEqual([]);
});

it.each(["off", "read", "undesignated", "absent"] as const)("asks before publishing a pointer-backed store whose backing is %s", async (role) => {
  const h = await refSyncFixture("separate");
  if (role === "absent") await h.a.git(["remote", "remove", "backing"]);
  else if (role === "undesignated") await h.a.git(["config", "--unset", "remote.backing.arc-state"]);
  else await h.a.git(["config", "remote.backing.arc-state", role]);
  const ports = { ...h.a.ports, backingRepository: async () => h.origin };
  const config = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
  const before = (await h.a.git(["config", "--null", "--list", "--local"])).stdout;
  const requested = await runStoreRemote(ports, { remote: "origin", role: "push" });
  expect(requested).toMatchObject({ status: "confirmation-needed", repository: h.origin,
    condition: expect.stringContaining("everything"), remedy: { text: expect.stringContaining("--own-state"),
      argv: ["arc", "store", "remote", "origin", "push", "--own-state"] } });
  if (requested.status !== "confirmation-needed") throw new Error("Publication confirmation missing");
  expect(requested.remedy.text).toContain("arc store remote backing push");
  expect((await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await h.a.git(["config", "--null", "--list", "--local"])).stdout).toBe(before);
  const accepted = await runStoreRemote(ports, { remote: "origin", role: "push", ownState: true });
  expect(accepted).toMatchObject({ status: "ok", result: { layout: "default", report: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(h.origin), remedy: expect.objectContaining({ text: expect.stringContaining("read") }) }),
  ]) } } });
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
  await expect(h.a.ports.fs.lstat(`${h.a.root}/.git/arc/store`)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});

it("keeps concurrent project checks independent while a completed fetch is awaiting its decision", async () => {
  const h = await refSyncFixture(), foreign = await refSyncFixture();
  for (const [checkout, id] of [[h.a, localId], [foreign.a, foreignId]] as const) {
    success(await checkout.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: id }), provenance }));
    success(await checkout.store.push());
  }
  await h.a.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
  await h.a.exec("git", ["remote", "set-url", "origin", foreign.origin]);
  let announce = () => {}, resume = () => {}, armed = true;
  const reached = new Promise<void>((resolve) => { announce = resolve; });
  const continued = new Promise<void>((resolve) => { resume = resolve; });
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (armed && args.includes("fetch") && args.some((arg) => arg.includes("refs/arc/tmp/designate/"))) {
      armed = false; announce(); await continued;
    }
    return result;
  } });
  const first = store.pull();
  try {
    await reached;
    await h.a.exec("git", ["remote", "set-url", "origin", h.origin]);
    const second = await runStoreRemote({ ...h.a.ports, lock: (name, wait) => h.a.ports.lock(name, name.startsWith("refs/arc/tmp/designate/") ? 1 : wait) }, { remote: "origin", role: "push" });
    expect(second.status, JSON.stringify(second)).toBe("ok");
  } finally { resume(); }
  expect(success(await first).pulls).toContainEqual(expect.objectContaining({ status: "failed", role: "candidate",
    failure: expect.objectContaining({ condition: expect.stringContaining(foreignId) }) }));
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
});

it("checks a push setting's project before changing layout or configuration and checks a repaired target afresh", async () => {
  const h = await refSyncFixture("default"), foreign = await refSyncFixture("default");
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: localId }), provenance }));
  success(await foreign.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: foreignId }), provenance }));
  success(await foreign.a.store.push());
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  await h.a.exec("git", ["remote", "add", "candidate", foreign.origin]);
  const config = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
  const result = await runStoreRemote(h.a.ports, { remote: "candidate", role: "push" });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch",
    expected: { owner: { uid: localId } }, actual: { owner: { uid: foreignId } } } } });
  expect(await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, {
    remote: "candidate", role: "push", ownState: true,
  })).toEqual(result);
  expect((await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout).toBe(config);
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
  expect(success(await h.a.store.read({ reference: identity })).content).toBe(JSON.stringify({ projectId: localId }));
  await h.a.exec("git", ["remote", "set-url", "candidate", h.origin]);
  expect((await runStoreRemote(h.a.ports, { remote: "candidate", role: "push" })).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});

it.each(["default", "separate"] as const)("refuses a second push designation without changing the %s store", async (layout) => {
  const h = await refSyncFixture(layout);
  await h.a.exec("git", ["remote", "add", "other", h.origin]);
  const codeConfig = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
  const storeConfig = (await h.a.git(["config", "--null", "--list", "--local"])).stdout;
  const target = layout === "default" ? "other" : "origin";
  const other = layout === "default" ? "origin" : "backing";
  const result = await runStoreRemote(h.a.ports, { remote: target, role: "push" });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: expect.stringContaining(other), remedy: { text: expect.stringContaining(`arc store migrate --to ${target}`) } } });
  if (result.status !== "refused" || !("remedy" in result.refusal)) throw new Error("Role conflict missing");
  expect(result.refusal.remedy.text).toContain(`arc store remote ${other} off`);
  expect((await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout).toBe(codeConfig);
  expect((await h.a.git(["config", "--null", "--list", "--local"])).stdout).toBe(storeConfig);
  expect((await runStoreRemote(h.a.ports, { remote: other, role: "off" })).status).toBe("ok");
  expect((await runStoreRemote(h.a.ports, { remote: target, role: "push" })).status).toBe("ok");
});
