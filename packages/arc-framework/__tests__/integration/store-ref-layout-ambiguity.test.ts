/** A directory-present designation stop names the configuration repair at every command boundary. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("repairs competing publishers beside a separate store before migration, sync or settings can proceed", async () => {
  const h = await refSyncFixture("separate");
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "kept.md", owner: { type: "person", name: "andrew" } });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Keep this state.\n", provenance: { verb: "start", lifecycleAction: "seed" } }));
  const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
  success(await h.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: "34567890-1234-4234-8234-123456789abc" }), provenance: { verb: "start", lifecycleAction: "seed" } }));
  success(await h.a.store.push());
  await h.a.git(["remote", "remove", "backing"]);
  await h.a.exec("git", ["remote", "add", "other", h.origin]);
  await h.a.exec("git", ["remote", "add", "third", h.origin]);
  for (const name of ["origin", "other"]) await h.a.exec("git", ["config", `remote.${name}.arc-state`, "push"]);
  await h.a.exec("git", ["config", "remote.third.arc-state", "off"]);
  const destination = join(h.origin, "..", "destination");
  await h.a.exec("git", ["init", "--bare", destination]);
  const snapshot = async () => ({
    codeConfig: (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout,
    storeConfig: (await h.a.git(["config", "--null", "--list", "--local"])).stdout,
    codeRefs: (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout,
    storeRefs: (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout,
    destinationRefs: (await h.a.exec("git", [`--git-dir=${destination}`, "for-each-ref"])).stdout,
    separate: (await h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store"))).isDirectory(),
  });
  const before = await snapshot();
  const pulled = success(await h.a.store.pull()), pushed = success(await h.a.store.push());
  const commands = [
    await invokeStoreMigrate([], h.a.ports),
    await invokeStoreMigrate(["--to", destination, "--trial"], h.a.ports),
    (await invokeStoreRemote(["third", "read", "--json"], { cwd: h.a.root, ports: h.a.ports })).result,
    (await invokeStoreRemote(["backing", "off", "--json"], { cwd: h.a.root, ports: h.a.ports })).result,
  ];
  const explanation = { condition: expect.stringMatching(/origin.*other/u), remedy: { text: expect.stringContaining("arc store remote <name> off") } };
  for (const states of [pulled.states, pushed.states]) expect.soft(states).toContainEqual({ status: "move-incomplete", ...explanation });
  for (const result of commands) expect.soft(result).toMatchObject({ status: "refused", refusal: explanation });
  expect(await snapshot()).toEqual(before);
  expect((await invokeStoreRemote(["origin", "off", "--json"], { cwd: h.a.root, ports: h.a.ports })).result.status).toBe("ok");
  expect((await invokeStoreMigrate([], h.a.ports)).status).toBe("ok");
  expect(success(await h.a.store.pull()).states).not.toContainEqual(expect.objectContaining({ status: "move-incomplete" }));
  success(await h.a.store.write({ action: "put", reference: { ...reference, key: "after.md" }, expected: null, content: "After repair.\n", provenance: { verb: "start", lifecycleAction: "seed" } }));
  expect(success(await h.a.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: { ...reference, key: "after.md" } })).content).toBe("After repair.\n");
  expect((await invokeStoreMigrate(["--to", destination, "--trial"], h.a.ports)).status).toBe("ok");
  expect(success(await h.a.store.read({ reference })).content).toBe("Keep this state.\n");
}, 60_000);
