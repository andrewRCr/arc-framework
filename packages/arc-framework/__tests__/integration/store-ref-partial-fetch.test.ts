import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRefSyncCheckout, refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeGitExec } from "../helpers/integration.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

const provenance = { verb: "edit", lifecycleAction: "save" };
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "shared.md", owner: { type: "person", name: "andrew" } });
const first = "# First shared record\n\n" + "First code blob.\n".repeat(30);
const second = "# Later shared record\n\n" + "Completely different later code blob.\n".repeat(45);

async function partialFixture(protocol: "0" | "2", bitmaps: boolean) {
  const h = await refSyncFixture();
  const code = await plantRef(h.a.root, "refs/heads/shared-code", [{ path: "one.md", content: first }, { path: "two.md", content: second }],
    { parents: [(await h.a.git(["rev-parse", "HEAD"])).stdout.trim()] });
  await h.a.git(["push", "origin", "refs/heads/shared-code:refs/heads/shared-code"]);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: first, provenance }));
  success(await h.a.store.push());
  await h.remote("git", ["config", "uploadpack.allowFilter", "true"]);
  await h.remote("git", ["config", "repack.writeBitmaps", String(bitmaps)]);
  const repack = () => h.remote("git", ["repack", "-ad", ...bitmaps ? ["--write-bitmap-index"] : []]);
  await repack();
  const root = join(h.a.root, "partial");
  await h.a.exec("git", ["clone", "--filter=blob:none", "--no-checkout", "--branch", "shared-code", pathToFileURL(h.origin).href, root]);
  const git = makeGitExec(root);
  for (const [key, value] of [["arc.identity", "andrew"], ["remote.origin.arc-state", "push"], ["protocol.version", protocol],
    ["remote.origin.negotiationInclude", "refs/heads/*"], ["user.name", "Partial clone"], ["user.email", "partial@example.com"]]) {
    await git("git", ["config", key!, value!]);
  }
  return { ...h, partial: await createRefSyncCheckout(root, "default", h.origin), code, repack };
}

describe("partial state fetch completeness", () => {
  it.each(["unchanged", "advanced"] as const)("refuses an incomplete refetch and repairs its missing ancestor with the remote %s", async (remote) => {
    const h = await partialFixture("0", true);
    let suppressRepair = true;
    const store = createRefStore({ ...h.partial.ports, exec: (command, args, options) => h.partial.ports.exec(command,
      suppressRepair && args.includes("fetch") ? args.filter((arg) => arg !== "--refetch") : args, options) });
    const failed = success(await store.pull());
    expect(failed.pulls).toContainEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({
      code: "refused", class: "terminal", condition: expect.stringContaining(h.code.blobs.get("one.md")!),
    }) }));
    expect((await h.partial.git(["for-each-ref", "--format=%(refname)", expandStoredPath(reference).ref])).stdout).toBe("");
    const content = remote === "advanced" ? "This new state blob was never in code history.\n" : first;
    if (remote === "advanced") {
      const current = success(await h.a.store.read({ reference }));
      success(await h.a.store.write({ action: "put", reference, expected: current.version, content, provenance }));
      success(await h.a.store.push()); await h.repack();
    }
    suppressRepair = false;
    expect(success(await store.pull()).pulls.every(({ status }) => status !== "failed")).toBe(true);
    const tracking = expandStoredPath(reference).ref.replace("refs/arc/", "refs/arc-remotes/origin/");
    const objects = await h.partial.exec("git", ["rev-list", "--objects", "--missing=print", tracking], { objectAccess: "local-only" });
    expect(objects.stdout.split("\n").filter((line) => line.startsWith("?"))).toEqual([]);
    expect(success(await store.read({ reference })).content).toBe(content);
    expect(success(await store.history({ reference }))).toContainEqual(expect.objectContaining({ content: first }));
  }, 30_000);

  it.each([
    { protocol: "0" as const, bitmaps: true }, { protocol: "0" as const, bitmaps: false },
    { protocol: "2" as const, bitmaps: true }, { protocol: "2" as const, bitmaps: false },
  ])("holds every shared blob after first and later protocol $protocol fetches with bitmaps=$bitmaps", async ({ protocol, bitmaps }) => {
    const h = await partialFixture(protocol, bitmaps);
    const blobs = [h.code.blobs.get("one.md")!, h.code.blobs.get("two.md")!];
    for (const blob of blobs) await expect(h.partial.exec("git", ["cat-file", "-e", blob], { objectAccess: "local-only" })).rejects.toBeDefined();
    const observations: { missing: string[]; refetches: number } = { missing: [], refetches: 0 };
    const store = createRefStore({ ...h.partial.ports, exec: async (command, args, options) => {
      const result = await h.partial.ports.exec(command, args, options);
      if (args.includes("rev-list") && args.includes("--missing=print")) observations.missing.push(...result.stdout.split("\n").filter((line) => line.startsWith("?")).map((line) => line.slice(1)));
      if (args.includes("fetch") && args.includes("--refetch")) observations.refetches++;
      return result;
    } });
    success(await store.pull());
    const tracking = expandStoredPath(reference).ref.replace("refs/arc/", "refs/arc-remotes/origin/");
    const available = async () => {
      const result = await h.partial.exec("git", ["rev-list", "--objects", "--missing=print", tracking], { objectAccess: "local-only" });
      expect(result.stdout.split("\n").filter((line) => line.startsWith("?"))).toEqual([]);
    };
    await available();
    expect(success(await store.read({ reference })).content).toBe(first);
    await expect(h.partial.exec("git", ["cat-file", "-e", blobs[1]!], { objectAccess: "local-only" })).rejects.toBeDefined();
    const before = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: before.version, content: second, provenance }));
    success(await h.a.store.push()); await h.repack();
    observations.missing = []; observations.refetches = 0;
    success(await store.pull());
    await available();
    const tracePath = join(h.partial.root, "passive-reads.trace"), previousTrace = process.env.GIT_TRACE;
    await writeFile(tracePath, ""); process.env.GIT_TRACE = tracePath;
    try {
      expect(success(await store.read({ reference })).content).toBe(second);
      expect(success(await store.history({ reference }))).toContainEqual(expect.objectContaining({ content: first }));
    } finally {
      if (previousTrace === undefined) delete process.env.GIT_TRACE;
      else process.env.GIT_TRACE = previousTrace;
    }
    expect(await readFile(tracePath, "utf8")).not.toMatch(/run_command: git.*fetch|built-in: git fetch|upload-pack/u);
    if (protocol === "0" && bitmaps) {
      expect(observations.missing).toContain(blobs[1]);
      expect(observations.refetches).toBe(1);
    }
    if (protocol === "2") {
      expect(observations.missing).toEqual([]);
      expect(observations.refetches).toBe(0);
    }
  }, 30_000);

  it.each(["default", "separate"] as const)("skips the completeness traversal in an unfiltered %s store", async (layout) => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: first, provenance }));
    success(await h.a.store.push());
    let traversed = false;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      if (args.includes("rev-list") && args.includes("--missing=print")) traversed = true;
      return h.b.ports.exec(command, args, options);
    } });
    expect(success(await store.pull()).pulls).toContainEqual(expect.objectContaining({ status: "pulled" }));
    expect(success(await store.read({ reference })).content).toBe(first);
    expect(traversed).toBe(false);
  });

  it("retains a rewrite notice when another fetched ref stays incomplete", async () => {
    const h = await partialFixture("0", true);
    const inbox = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
    success(await h.a.store.write({ action: "put", reference: inbox, expected: null, content: "# Atomic Inbox\n\n## Inbox\n\nKept inbox.\n", provenance }));
    success(await h.a.store.push());
    success(await h.partial.store.pull());
    const home = expandStoredPath(inbox), kept = (await h.partial.git(["rev-parse", home.ref])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", home.ref])).stdout.split("\n").filter(Boolean);
    await plantRef(h.a.root, home.ref, rows.map((row) => {
      const at = row.indexOf(" "); return { path: row.slice(at + 1), oid: row.slice(0, at), mode: "100644" as const };
    }), { message: "Rewrite inbox history outside the store" });
    await h.a.git(["push", "--force", "origin", `${home.ref}:${home.ref}`]);
    const before = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: before.version, content: second, provenance }));
    const personal = expandStoredPath(reference).ref;
    await h.a.git(["push", "origin", `${personal}:${personal}`]); await h.repack();
    const store = createRefStore({ ...h.partial.ports, exec: (command, args, options) => h.partial.ports.exec(command,
      args.includes("fetch") ? args.filter((arg) => arg !== "--refetch") : args, options) });
    const result = success(await store.pull());
    expect(result.pulls).toContainEqual(expect.objectContaining({ status: "failed",
      failure: expect.objectContaining({ code: "refused", condition: expect.stringContaining(h.code.blobs.get("two.md")!) }),
      notices: expect.arrayContaining([expect.objectContaining({ kind: "history-diverged", ref: home.ref })]),
    }));
    expect((await h.partial.git(["rev-parse", home.ref])).stdout.trim()).toBe(kept);
    expect(success(await store.read({ reference })).content).toBe(first);
  }, 30_000);
});
