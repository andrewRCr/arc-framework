/** Independently acquired upstream state through the public read-only store factory. */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createReadSourceStore, createRefStore, HistoryRefSchema, RecordReferenceSchema, PushResultSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

async function sourceFixture(layout: "default" | "separate", copyIntoLocal = true) {
  const h = await refSyncFixture(layout);
  const primary = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "seed" } }));
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "extra" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Upstream notes.\n", provenance }));
  await h.a.git(["push", h.remoteName, "refs/arc/work/*:refs/arc/work/*"]);
  if (copyIntoLocal) {
    await h.b.git(["fetch", h.origin, "refs/arc/work/*:refs/arc/work/*"]);
    const local = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: local.version, content: "Local notes.\n", provenance }));
  }
  const state = join(h.b.root, "state.git");
  await h.b.exec("git", ["init", "--bare", state]);
  await h.b.git(["remote", "set-url", h.remoteName, state]);
  await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
  await h.b.exec("git", ["config", "remote.upstream.arc-state", "read"]);
  return { ...h, primary: primary.reference, reference, source: createReadSourceStore(h.b.ports, "upstream") };
}

async function addLocalOnly(h: Awaited<ReturnType<typeof sourceFixture>>) {
  return success(await h.b.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "local-only" } }),
    content: makeMetaFixture("local-only"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "seed" } }));
}

async function sourceStates(layout: "default" | "separate") {
  const h = await sourceFixture(layout);
  success(await h.b.store.pull());
  const before = success(await h.source.version());
  const local = success(await h.a.store.read({ reference: h.reference }));
  success(await h.a.store.write({ action: "put", reference: h.reference, expected: local.version, content: "Updated upstream.\n", provenance }));
  await h.a.git(["push", h.remoteName, "refs/arc/work/*:refs/arc/work/*"]);
  success(await h.b.store.pull());
  const after = success(await h.source.version());
  return { ...h, before, after };
}

describe.each(["default", "separate"] as const)("read-source store (%s)", (layout) => {
  it("reads upstream bytes while preserving the local view", async () => {
    const h = await sourceFixture(layout);
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls).toContainEqual(expect.objectContaining({ remote: "upstream", role: "read", status: "pulled" }));
    expect(success(await h.source.read({ reference: h.reference })).content).toBe("Upstream notes.\n");
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Local notes.\n");
  });

  it("lists only the upstream's records", async () => {
    const h = await sourceFixture(layout);
    await addLocalOnly(h);
    success(await h.b.store.pull());
    const listed = success(await h.source.list({ family: "work-item", kind: "work-item/meta" }));
    expect(listed.status).toBe("complete");
    if (listed.status !== "complete") throw new Error("Incomplete source listing");
    expect(listed.records.map(({ reference }) => reference.owner.name)).toEqual(["alpha"]);
    expect(listed.diagnostics).toEqual([]);
  });

  it("looks up upstream owners without resolving local-only owners", async () => {
    const h = await sourceFixture(layout);
    await addLocalOnly(h);
    success(await h.b.store.pull());
    expect(success(await h.source.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") })).reference).toEqual(h.primary);
    expect(await h.source.lookup({ kind: "slug", slug: SlugSchema.parse("local-only") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.b.store.lookup({ kind: "slug", slug: SlugSchema.parse("local-only") })).reference.owner.name).toBe("local-only");
  });

  it("retains the source version without replacing the main store's version", async () => {
    const h = await sourceFixture(layout);
    success(await h.b.store.pull());
    const own = success(await h.b.store.version()), source = success(await h.source.version());
    expect(source).not.toBe(own);
    expect((await h.b.git(["rev-parse", "refs/arc/tmp/read/upstream/version"])).stdout).toBe(source);
    expect((await h.b.git(["rev-parse", "refs/arc/tmp/version"])).stdout).toBe(own);
  });

  it("reads and lists a source snapshot after the upstream advances", async () => {
    const h = await sourceStates(layout);
    expect(success(await h.source.read({ reference: h.reference, asOf: h.before })).content).toBe("Upstream notes.\n");
    expect(success(await h.source.read({ reference: h.reference })).content).toBe("Updated upstream.\n");
    const listed = success(await h.source.list({ family: "work-item", kind: "work-item/companion", asOf: h.before }));
    expect(listed.status).toBe("complete");
    if (listed.status !== "complete") throw new Error("Incomplete source snapshot");
    expect(listed.records.map(({ content }) => content)).toEqual(["Upstream notes.\n"]);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Local notes.\n");
  });

  it("reads source history without the local fork's edit", async () => {
    const h = await sourceStates(layout);
    const history = success(await h.source.history({ reference: h.reference }));
    expect(history.map(({ content }) => content)).toEqual(["Updated upstream.\n", "Upstream notes.\n"]);
  });

  it("reports changes between source versions", async () => {
    const h = await sourceStates(layout);
    expect(h.after).not.toBe(h.before);
    const changed = success(await h.source.changes({ from: h.before, to: h.after, references: [h.reference] }));
    expect(changed.map(({ content }) => content)).toEqual(["Updated upstream.\n"]);
  });

  it.each(["pull", "push"] as const)("keeps read sources active when configuration stops the state %s", async (operation) => {
    const h = await sourceFixture(layout);
    if (layout === "default") {
      await h.b.exec("git", ["remote", "add", "other", h.origin]);
      await h.b.exec("git", ["config", "remote.other.arc-state", "push"]);
    } else await h.b.exec("git", ["config", "remote.origin.arc-state", "push"]);
    const result = success(await h.b.store[operation]());
    expect(result.states).toContainEqual(expect.objectContaining({ status: layout === "default" ? "designation-ambiguous" : "move-incomplete" }));
    expect(result.pulls).toContainEqual(expect.objectContaining({ remote: "upstream", role: "read", status: "pulled" }));
    expect(result.pulls.some(({ role }) => role === "state")).toBe(false);
    if (operation === "push") expect(PushResultSchema.parse(result).publishes).toEqual([]);
    expect(success(await h.source.read({ reference: h.reference })).content).toBe("Upstream notes.\n");
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Local notes.\n");
  });

  it("reads the code remote by its resolved URL where the store has separate configuration", async () => {
    const h = await sourceFixture(layout);
    await h.b.exec("git", ["remote", "remove", "upstream"]);
    await h.b.exec("git", ["remote", "set-url", "origin", h.origin]);
    await h.b.exec("git", ["config", "remote.origin.arc-state", "read"]);
    const source = createReadSourceStore(h.b.ports, "origin");
    const result = success(await h.b.store.pull());
    expect(result.pulls).toContainEqual(expect.objectContaining({ remote: "origin", role: "read", status: "pulled" }));
    expect(success(await source.read({ reference: h.reference })).content).toBe("Upstream notes.\n");
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Local notes.\n");
  });

  it("excludes every identity scope and never publishes to the read source", async () => {
    const h = await sourceFixture(layout);
    const personal = RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "# Upstream inbox\n", provenance }));
    const alex = createRefStore({ ...h.a.ports, identity: async () => SlugSchema.parse("alex"), actor: async () => "alex@00000000-0000-4000-8000-000000000001" });
    success(await alex.write({ action: "put", reference: RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "alex" } }), expected: null, content: "# Alex inbox\n", provenance }));
    await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
    success(await h.b.store.write({ action: "put", reference: personal, expected: null, content: "# Local inbox\n", provenance }));
    const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const pulled = success(await h.b.store.push());
    const outcome = pulled.pulls.find(({ remote }) => remote === "upstream");
    expect(outcome).toMatchObject({ role: "read", status: "pulled" });
    expect(outcome?.families).not.toEqual(expect.arrayContaining(["personal", "claims"]));
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/upstream/user/"])).stdout).toBe("");
    expect(await h.source.read({ reference: personal })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.b.store.read({ reference: personal })).content).toBe("# Local inbox\n");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    expect(success(await h.source.read({ reference: h.reference })).content).toBe("Upstream notes.\n");
  });

  it("recovers a source snapshot by pulling the history ref its refusal names", async () => {
    const h = await sourceFixture(layout, false);
    const state = success(await h.a.store.version());
    success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "carrier" } }),
      content: makeMetaFixture("carrier", { stateAtHandoff: state }), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "seed" } }));
    success(await h.a.store.write({ action: "put", reference: h.primary, expected: success(await h.a.store.read({ reference: h.primary })).version,
      content: makeMetaFixture("alpha"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    const history = HistoryRefSchema.parse(`refs/arc/history/work/${"uid" in h.primary.owner ? h.primary.owner.uid : ""}`);
    const refused = await h.source.read({ reference: h.reference, asOf: state });
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [history] } });
    if (refused.status !== "refused" || refused.refusal.code !== "state-unresolvable") throw new Error("Missing source history refusal");
    const pulled = success(await h.b.store.pull({ history: refused.refusal.historyRefs }));
    expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
    expect(success(await h.source.read({ reference: h.reference, asOf: state })).content).toBe("Upstream notes.\n");
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/upstream/history/"])).stdout).toBe(history.replace("refs/arc/", "refs/arc-remotes/upstream/"));
    expect(await h.b.store.read({ reference: h.reference })).toMatchObject({ status: "refused" });
  });

  it("offers only an executable take-theirs remedy for a rewritten read source", async () => {
    const h = await sourceFixture(layout);
    success(await h.b.store.pull());
    const uid = "uid" in h.primary.owner ? h.primary.owner.uid : "";
    const ref = `refs/arc/work/${uid}`, tracking = `refs/arc-remotes/upstream/work/${uid}`;
    const first = (await h.a.git(["rev-parse", ref])).stdout;
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: success(await h.a.store.read({ reference: h.reference })).version,
      content: "Second upstream.\n", provenance }));
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    success(await h.b.store.pull());
    const second = (await h.a.git(["rev-parse", ref])).stdout;
    await h.a.git(["update-ref", ref, first, second]);
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: success(await h.a.store.read({ reference: h.reference })).version,
      content: "Rewritten upstream.\n", provenance }));
    await h.a.git(["push", `--force-with-lease=${ref}:${second}`, h.remoteName, `${ref}:${ref}`]);
    const outcome = success(await h.b.store.pull()).pulls.find(({ remote }) => remote === "upstream");
    const notice = outcome?.notices.find(({ kind }) => kind === "history-diverged");
    expect(notice).toMatchObject({ kind: "history-diverged", ref });
    if (notice?.kind !== "history-diverged") throw new Error("Missing source rewrite notice");
    expect((await h.b.git(["rev-parse", tracking])).stdout).toBe(second);
    expect(success(await h.source.read({ reference: h.reference })).content).toBe("Second upstream.\n");
    expect(notice.remedy.text).toContain("Take theirs");
    expect(notice.remedy.text).not.toMatch(/Keep ours|Merge both|update-ref|push/iu);
    expect(notice.remedy.argv?.[0]).toBe("git");
    if (!notice.remedy.argv) throw new Error("Missing executable source remedy");
    await h.b.exec("git", notice.remedy.argv.slice(1));
    const repaired = success(await h.b.store.pull());
    expect(repaired.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "history-diverged")).toBe(false);
    expect(success(await h.source.read({ reference: h.reference })).content).toBe("Rewritten upstream.\n");
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Local notes.\n");
  });

  it.each(["local-only", "state-remote", "existing-id"] as const)("adopts the source project identity only into an uninitialized local-only store: %s", async (mode) => {
    const h = await sourceFixture(layout);
    const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    const projectId = "34567890-1234-4234-8234-123456789abc", existingId = "34567890-1234-4234-8234-123456789abd";
    const content = JSON.stringify({ projectId });
    success(await h.a.store.write({ action: "put", reference, expected: null, content, provenance: { verb: "init", lifecycleAction: "seed" } }));
    await h.a.git(["push", h.remoteName, "refs/arc/project/*:refs/arc/project/*"]);
    if (mode !== "state-remote") await h.b.git(["config", `remote.${h.remoteName}.arc-state`, "off"]);
    if (mode === "existing-id") success(await h.b.store.write({ action: "put", reference, expected: null, content: JSON.stringify({ projectId: existingId }), provenance: { verb: "init", lifecycleAction: "seed" } }));
    const pulled = success(await h.b.store.pull());
    expect(pulled.pulls).toContainEqual(expect.objectContaining({ remote: "upstream", role: "read", status: "pulled" }));
    expect(success(await h.source.read({ reference })).content).toBe(content);
    if (mode === "state-remote") {
      expect(await h.b.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      return;
    }
    const record = success(await h.b.store.read({ reference }));
    expect(record.content).toBe(mode === "local-only" ? content : JSON.stringify({ projectId: existingId }));
    if (mode === "local-only") expect(success(await h.b.store.history({ reference }))[0]?.provenance).toMatchObject({ verb: "sync", lifecycleAction: "adopt-project-id" });
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).version).toBe(record.version);
    expect(success(await h.b.store.history({ reference }))).toHaveLength(1);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Local notes.\n");
  });

});
