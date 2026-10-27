import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";

describe.each(["default", "separate"] as const)("final merged paths in %s", layout => {
  it.each([false, true])("holds a file/directory collision with the incoming file=%s and retries after source repair", async incomingFile => {
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const document = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: document("base.md"), expected: null, content: "Common document.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const a = document(incomingFile ? "node" : "node.andrew/child.md"), b = document(incomingFile ? "node.andrew/child.md" : "node");
    success(await h.a.store.write({ action: "put", reference: a, expected: null, content: "Incoming side.\n", provenance }));
    success(await h.b.store.write({ action: "put", reference: b, expected: null, content: "Local side.\n", provenance }));
    const independent = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent published update.\n";
    success(await h.a.store.write({ action: "put", reference: independent, expected: null, content, provenance }));
    success(await h.a.store.push());
    const ref = "refs/arc/user/andrew/personal", before = (await h.b.git(["rev-parse", ref])).stdout.trim();
    const notices = success(await h.b.store.pull()).pulls.flatMap(row => row.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref,
      condition: expect.stringContaining("node"), remedy: { text: expect.stringMatching(/repair|rename|distinct/iu) } }));
    expect((await h.b.git(["rev-parse", ref])).stdout.trim()).toBe(before);
    expect(success(await h.b.store.read({ reference: b })).content).toBe("Local side.\n");
    expect(success(await h.b.store.read({ reference: independent })).content).toBe(content);
    success(await h.a.store.write({ action: "remove", reference: a, expected: success(await h.a.store.read({ reference: a })).version, provenance }));
    success(await h.a.store.push());
    expect(success(await h.b.store.pull()).pulls.flatMap(row => row.notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: b })).content).toBe("Local side.\n");
  });

  it.each(["equal", "incoming parent", "incoming child"] as const)("holds a retained opaque entry against an %s path", async relation => {
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const document = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });
    const base = document("base.md");
    success(await h.a.store.write({ action: "put", reference: base, expected: null, content: "Common document.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const selected = document(relation === "incoming child" ? "node/child.md" : "node"), home = expandStoredPath(selected);
    const rows = (await h.b.git(["ls-tree", "-r", "--format=%(objectname) %(path)", home.ref])).stdout.trim().split("\n");
    const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
    const prior = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const path = relation === "equal" ? home.path : relation === "incoming parent" ? `${home.path}/opaque` : home.path.slice(0, home.path.lastIndexOf("/"));
    const local = await plantRef(h.b.root, home.ref, [...entries, { path, mode: "120000", content: "unresolved-opaque-target" }],
      { gitDir: h.b.gitDir, parents: [prior] });
    success(await h.a.store.write({ action: "put", reference: selected, expected: null, content: "Incoming record.\n", provenance }));
    success(await h.a.store.push());
    const notices = success(await h.b.store.pull()).pulls.flatMap(row => row.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref, condition: expect.stringContaining(path) }));
    expect((await h.b.git(["rev-parse", home.ref])).stdout.trim()).toBe(local.tip);
    expect(success(await h.b.store.read({ reference: base })).content).toBe("Common document.\n");
    await plantRef(h.b.root, home.ref, entries, { gitDir: h.b.gitDir, parents: [local.tip], message: "Remove the colliding opaque entry" });
    expect(success(await h.b.store.pull()).pulls.flatMap(row => row.notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: selected })).content).toBe("Incoming record.\n");
  });
});

it.each(["code", "backing"] as const)("refuses colliding private migration output from %s and retries after repair", async source => {
  const h = await switchFixture(source, "backing"), provenance = { verb: "edit", lifecycleAction: "save" };
  const document = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });
  success(await h.b.store.pull());
  const parent = document("collision"), child = document("collision.andrew/child.md"), ref = expandStoredPath(parent).ref;
  success(await h.b.store.write({ action: "put", reference: child, expected: null, content: "Destination child.\n", provenance }));
  await h.b.git(["push", "--atomic", h.destinationDirectory, "refs/arc/project/registry:refs/arc/project/registry", `${ref}:${ref}`]);
  success(await h.store.write({ action: "put", reference: parent, expected: null, content: "Source parent.\n", provenance }));
  success(await h.store.push());
  const sourceBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destinationBefore = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const refused = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "namespace-corrupt",
    namespace: ref, condition: expect.stringContaining("collision"), remedy: { text: expect.stringMatching(/source|repair/iu) } } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(sourceBefore);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destinationBefore);
  success(await h.store.write({ action: "remove", reference: parent, expected: success(await h.store.read({ reference: parent })).version, provenance }));
  await h.a.git(["push", h.sourceName, `${ref}:${ref}`]);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: child })).content).toBe("Destination child.\n");
}, 60_000);
