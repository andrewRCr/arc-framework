/** Native remote-move endpoints with production pointer binding and local unpublished state. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createRefSyncCheckout, refSyncFixture } from "./ref-sync.js";
import { success } from "./suite-tools.js";
import { createStoreCommandPorts } from "../../../src/commands/store-ports.js";
import { createRefStore, RecordReferenceSchema } from "../../../src/lib/store/index.js";

export const projectId = "34567890-1234-4234-8234-123456789abc";
export const provenance = { verb: "edit", lifecycleAction: "save" };
export const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
export const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "shared.md", owner: { type: "person", name: "andrew" } });
export type Endpoint = "code" | "backing" | "upstream";
export const directions: { source: Endpoint; destination: Endpoint }[] = [
  { source: "code", destination: "backing" }, { source: "backing", destination: "code" },
  { source: "backing", destination: "backing" }, { source: "code", destination: "upstream" },
  { source: "upstream", destination: "code" }, { source: "backing", destination: "upstream" },
  { source: "upstream", destination: "backing" },
];

export async function switchFixture(source: Endpoint = "code", destination: Endpoint = "backing") {
  const h = await refSyncFixture(source === "code" ? "default" : "separate");
  const config = join(h.a.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.a.root, ".arc", "system"), { recursive: true });
  await writeFile(config, '# Keep this comment.\nhistory.policy: "rewrite-with-lease"\n' + (source === "backing" ? `storage.backing_repository: ${JSON.stringify(h.origin)}\n` : ""));
  const production = createStoreCommandPorts(h.a.root);
  const ports = { ...production, ...h.a.ports, backingRepository: production.backingRepository };
  const store = createRefStore(ports);
  if (source !== "code") await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  if (source === "upstream") {
    await h.a.git(["remote", "remove", "backing"]);
    await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  }
  success(await store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId }), provenance }));
  success(await store.write({ action: "put", reference: personal, expected: null, content: "Shared state.\n", provenance }));
  expect(success(await store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const sourceName = source === "code" ? "origin" : source;
  const destinationName = destination === "code" ? "origin" : destination;
  const destinationDirectory = join(h.a.root, "destination.git");
  await h.a.exec("git", ["init", "--bare", destinationDirectory]);
  if (destination === "code") await h.a.exec("git", ["remote", "set-url", "origin", destinationDirectory]);
  if (destination === "upstream") {
    await h.a.exec("git", ["remote", "add", "upstream", destinationDirectory]);
    await h.a.exec("git", ["config", "remote.upstream.arc-state", "off"]);
  }
  const pending = RecordReferenceSchema.parse({ ...personal, key: "pending.md" });
  success(await store.write({ action: "put", reference: pending, expected: null, content: "Pending local state.\n", provenance }));
  const sourcePersonal = (await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
  const sourceRegistryTree = (await h.remote("git", ["rev-parse", "refs/arc/project/registry^{tree}"])).stdout.trim();
  const heads = await Promise.all([`refs/arc-remotes/${sourceName}/`, `refs/arc/tmp/seen/${sourceName}/`].map(async root =>
    (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", root])).stdout.trim().split("\n").filter(Boolean).map(row => row.slice(root.length)).sort()));
  const to = destination === "backing" ? destinationDirectory : destinationName;
  return { ...h, ports, store, config, destinationDirectory, sourceName, destinationName, sourcePersonal, sourceRegistryTree, pending, heads, to };
}

export async function capturePeerState(h: Awaited<ReturnType<typeof switchFixture>>) {
  return new Map((await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.trim().split("\n")
    .filter(row => row && !row.startsWith("refs/arc/tmp/")).map(row => row.split(" ") as [string, string]));
}

export async function landPreparedOldPush(h: Awaited<ReturnType<typeof switchFixture>>, before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>) {
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(ref => before.get(ref) !== after.get(ref));
  await h.b.git(["push", "--atomic", ...changed.map(ref => `--force-with-lease=${ref}:${before.get(ref) ?? ""}`), "--", h.origin,
    ...changed.map(ref => `${after.get(ref) ?? ""}:${ref}`)]);
}


/** Start independent clones on two receivers containing the same project. */
export async function oppositeMoveFixture() {
  const h = await switchFixture();
  const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  await h.remote("git", ["push", "--atomic", h.destinationDirectory, ...refs.map(ref => `${ref}:${ref}`)]);
  await h.b.exec("git", ["remote", "set-url", "origin", h.destinationDirectory]);
  success(await h.b.store.pull());
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(join(h.b.root, ".arc", "system", "arc-config.yml"), "# Opposite mover.\n");
  const production = createStoreCommandPorts(h.b.root);
  return { ...h, peerPorts: { ...production, ...h.b.ports, backingRepository: production.backingRepository } };
}

/** Add a further independently locked clone with production pointer binding at a chosen receiver. */
export async function createRemoteMover(h: Awaited<ReturnType<typeof switchFixture>>, remote: string, label: string) {
  const root = join(h.a.root, label);
  await h.a.exec("git", ["clone", remote, root]);
  const side = await createRefSyncCheckout(root, "default", remote);
  for (const [key, value] of [["user.name", "Native mover"], ["user.email", "mover@example.com"], ["arc.identity", "andrew"], ["remote.origin.arc-state", "push"]] as const) await side.exec("git", ["config", key, value]);
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  const config = join(root, ".arc", "system", "arc-config.yml");
  await writeFile(config, "# Independently moving clone.\n");
  const production = createStoreCommandPorts(root);
  const ports = { ...production, ...side.ports, backingRepository: production.backingRepository };
  const store = createRefStore(ports);
  success(await store.pull());
  return { ...side, ports, store, config };
}

