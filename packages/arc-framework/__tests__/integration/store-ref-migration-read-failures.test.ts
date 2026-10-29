import { expect, it } from "vitest";
import { rename } from "node:fs/promises";
import { createKindRegistry, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { personal, provenance, createRemoteMover } from "../helpers/store/remote-move.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("preserves a follow copy's local corruption refusal and completes after forward repair", async () => {
  const late = RecordReferenceSchema.parse({ ...personal, key: "late-source.md" });
  let prepared = "";
  const h = await followFixture(async fixture => {
    success(await fixture.b.store.write({ action: "put", reference: late, expected: null, content: "Prepared late source data.\n", provenance }));
    prepared = (await fixture.b.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout;
  });
  const follower = h.follower, home = expandStoredPath(late, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
  await h.b.git(["push", `--force-with-lease=${home.ref}:`, "--", h.origin, `${prepared}:${home.ref}`]);
  const tip = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", home.ref])).stdout;
  const entries: PlantTreeEntry[] = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "ls-tree", "-r", "--format=%(objectmode) %(objectname) %(path)", tip])).stdout.split("\n").filter(Boolean).map(row => {
    const [mode = "", oid = "", ...path] = row.split(" ");
    if (mode !== "100644") throw new Error("Expected ordinary personal files");
    return { path: path.join(" "), mode, oid };
  });
  if (!entries.some(entry => entry.path === home.metadataPath)) throw new Error("Expected the produced personal metadata path");
  const damaged = await plantRef(h.destinationDirectory, home.ref, entries.map(entry => entry.path === home.metadataPath
    ? { path: entry.path, content: "{ corrupt destination metadata\n" } : entry), { parents: [tip], gitDir: h.destinationDirectory });
  const listing = async (url: string) => (await follower.exec("git", [`--git-dir=${url}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const source = await listing(h.origin), destination = await listing(h.destinationDirectory);
  const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref,
    remedy: { text: expect.stringMatching(/repair|metadata/iu) } } } });
  expect(await listing(h.origin)).toBe(source); expect(await listing(h.destinationDirectory)).toBe(destination);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await plantRef(h.destinationDirectory, home.ref, entries, { parents: [damaged.tip], gitDir: h.destinationDirectory });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect(success(await follower.store.read({ reference: late })).content).toBe("Prepared late source data.\n");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect(success(await follower.store.read({ reference: personal })).content).toBe("Shared state.\n");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
});

it("names the real departure destination and its own retry command after an unreachable read", async () => {
  const h = await followFixture(), follower = h.follower, offline = h.destinationDirectory + ".offline";
  await follower.exec("git", ["remote", "add", "state-home", h.destinationDirectory]);
  await follower.exec("git", ["config", "remote.state-home.arc-state", "off"]);
  await rename(h.destinationDirectory, offline);
  try {
    const refused = await invokeStoreMigrate(["--leave-source", "--to", "state-home"], follower.ports);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable", class: "recoverable",
      condition: expect.stringContaining("state-home"), remedy: { argv: ["arc", "store", "migrate", "--leave-source", "--to", "state-home"] } } } });
    expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  } finally { await rename(offline, h.destinationDirectory); }
  expect((await invokeStoreMigrate(["--leave-source", "--to", "state-home"], follower.ports)).status).toBe("ok");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});

it("returns the backing setting's retry route when its copy read fails after project admission", async () => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture(), offline = destination.origin + ".offline";
  const identity = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-registry/identity" });
  success(await h.a.store.write({ action: "put", reference: identity, expected: null,
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance }));
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Held backing source data.\n", provenance }));
  success(await h.a.store.push());
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  let armed = true;
  const base = { ...h.a.ports, backingRepository: async () => destination.origin };
  try {
    const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.a.root, ports: { ...base,
      exec: async (command, args, options) => {
        if (armed && args.includes("fetch") && args.includes(destination.origin) && (options?.input?.split(/\r?\n/u) ?? []).some(arg => arg.includes(":refs/arc/tmp/migrate/remote/"))) {
          armed = false; await rename(destination.origin, offline);
        }
        return h.a.ports.exec(command, args, options);
      },
    } })).result;
    expect(armed).toBe(false);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable", class: "recoverable",
      condition: expect.stringContaining("backing"), remedy: { argv: ["arc", "store", "remote", "backing", "push"] } } } });
    expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.origin);
    expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("push");
  } finally { if (!armed) await rename(offline, destination.origin); }
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.a.root, ports: base })).result.status).toBe("ok");
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(destination.origin);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect(success(await h.a.store.read({ reference: personal })).content).toBe("Held backing source data.\n");
});

it("preserves a recorded re-copy's terminal corruption refusal and retries its retained follow", async () => {
  const h = await lateFollowFixture(false), follower = h.follower;
  const own = RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "beth" }, key: "new-remote.md" });
  const home = expandStoredPath(own, { registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
  let entries: PlantTreeEntry[] = [], damagedTip = "", source = "", destination = "";
  const listing = async (url: string) => (await follower.exec("git", [`--git-dir=${url}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => {
      if (step !== "follow.switched") return;
      await h.landLate();
      const peer = await createRemoteMover(h, h.destinationDirectory, "recopy-destination");
      const beth = createRefStore({ ...peer.ports, identity: async () => SlugSchema.parse("beth") });
      success(await beth.write({ action: "put", reference: own, expected: null, content: "Independent new-home data.\n", provenance }));
      success(await beth.push());
      const tip = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", home.ref])).stdout;
      entries = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "ls-tree", "-r", "--format=%(objectmode) %(objectname) %(path)", tip])).stdout.split("\n").filter(Boolean).map(row => {
        const [mode = "", oid = "", ...path] = row.split(" ");
        if (mode !== "100644") throw new Error("Expected ordinary personal files");
        return { path: path.join(" "), mode, oid };
      });
      if (!entries.some(entry => entry.path === home.metadataPath)) throw new Error("Expected personal metadata");
      const damaged = await plantRef(h.destinationDirectory, home.ref, entries.map(entry => entry.path === home.metadataPath
        ? { path: entry.path, content: "{ corrupt re-copy metadata\n" } : entry), { parents: [tip], gitDir: h.destinationDirectory });
      damagedTip = damaged.tip; source = await listing(h.origin); destination = await listing(h.destinationDirectory);
    },
  } })).result;
  expect(damagedTip).not.toBe("");
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref } } });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("refs/arc/tmp/migrate/move");
  expect(await listing(h.origin)).toBe(source); expect(await listing(h.destinationDirectory)).toBe(destination);
  await plantRef(h.destinationDirectory, home.ref, entries, { parents: [damagedTip], gitDir: h.destinationDirectory });
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  for (const content of ["Prepared late publication.", "Independent new-home data."]) {
    expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", content, home.ref])).stdout).toContain(content);
  }
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);
