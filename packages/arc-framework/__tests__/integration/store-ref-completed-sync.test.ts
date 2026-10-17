import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "save", lifecycleAction: "save" };

async function completedFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("completed-sync"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "completed-sync" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: before.content, placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${made.reference.owner.uid}`), archive = `refs/arc/archive/${quarter}`;
  const metadataPath = `metadata-${made.reference.owner.uid}.json`, folder = "01_completed-sync/";
  return { ...h, reference: made.reference, history, archive, metadataPath, folder };
}

describe.each(["default", "separate"] as const)("completed-item reconciliation in the %s layout", (layout) => {
  it("takes a remotely refreshed folder beside a different local archive", async () => {
    const h = await completedFixture(layout);
    const other = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("other-completed"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "other-completed" } }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const active = success(await h.a.store.read({ reference: other.reference }));
    success(await h.a.store.write({ action: "put", reference: active.reference, expected: active.version, content: active.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    const before = success(await h.b.store.read({ reference: h.reference })), content = `${before.content}\nRemote folder refresh.\n`;
    success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
      content, placement: { kind: "completed", quarter }, provenance }));
    const history = (await h.a.git(["rev-parse", h.history])).stdout;
    success(await h.b.store.push()); success(await h.a.store.pull());
    expect((await h.a.git(["rev-parse", h.history])).stdout).toBe(history);
    expect(success(await h.a.store.read({ reference: h.reference })).content).toBe(content);
    expect(success(await h.a.store.read({ reference: other.reference })).placement?.kind).toBe("completed");
  });
  it("leaves the local folder and history intact on fetch failure and retries without another quarter change", async () => {
    const h = await completedFixture(layout);
    const a = success(await h.a.store.read({ reference: h.reference })), b = success(await h.b.store.read({ reference: h.reference }));
    const localContent = `${a.content}\nLocal write.\n`, remoteContent = `${b.content}\nRemote write.\n`;
    success(await h.a.store.write({ action: "put", reference: a.reference, expected: a.version,
      content: localContent, placement: { kind: "completed", quarter }, provenance }));
    success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version,
      content: remoteContent, placement: { kind: "completed", quarter }, provenance }));
    success(await h.b.store.push());
    const history = (await h.a.git(["rev-parse", h.history])).stdout;
    const folder = (await h.a.git(["show", `${h.archive}:${h.folder}${h.metadataPath}`])).stdout;
    const failing = createRefStore({ ...h.a.ports, exec: (command, args, options) => args.includes("fetch")
      && args.some((arg) => arg.startsWith(`${h.history}*:`))
      ? h.a.ports.exec("git", ["fetch", `${h.origin}/missing-origin`], options) : h.a.ports.exec(command, args, options) });
    expect(success(await failing.pull()).pulls).toContainEqual(expect.objectContaining({ status: "failed",
      failure: expect.objectContaining({ code: "unreachable", cause: "error" }) }));
    expect((await h.a.git(["rev-parse", h.history])).stdout).toBe(history);
    expect((await h.a.git(["show", `${h.archive}:${h.folder}${h.metadataPath}`])).stdout).toBe(folder);
    success(await h.a.store.pull());
    const repaired = success(await h.a.store.read({ reference: h.reference }));
    expect(repaired.content).toBe(remoteContent);
    expect(repaired.conflicts).toHaveLength(1);
  });
  it.each(["history", "changes", "write", "reopen"] as const)("refuses %s on a stale history copy and admits the same retry after a named pull", async (operation) => {
    const h = await completedFixture(layout);
    const from = success(await h.a.store.version()), previous = (await h.a.git(["rev-parse", h.history])).stdout;
    const before = success(await h.b.store.read({ reference: h.reference })), content = `${before.content}\nRemote refresh.\n`;
    success(await h.b.store.write({ action: "put", reference: before.reference, expected: before.version,
      content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.b.store.push()); success(await h.a.store.pull());
    expect((await h.a.git(["rev-parse", h.history])).stdout).toBe(previous);
    const current = success(await h.a.store.read({ reference: h.reference })), to = success(await h.a.store.version());
    expect(current.content).toBe(content);
    const changed = `${content}\nA repaired write.\n`;
    const attempt = () => operation === "history" ? h.a.store.history({ reference: h.reference })
      : operation === "changes" ? h.a.store.changes({ from, to, references: [h.reference] })
      : h.a.store.write({ action: "put", reference: h.reference, expected: current.version,
        content: operation === "write" ? changed : content, placement: operation === "reopen" ? { kind: "active" } : { kind: "completed", quarter },
        provenance: operation === "reopen" ? { verb: "reopen", lifecycleAction: "reopen" } : provenance });
    const refs = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    expect(await attempt()).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", historyRefs: [h.history],
      remedy: { text: expect.stringMatching(/pull/iu) } } });
    expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(refs);
    success(await h.a.store.pull({ history: [h.history] }));
    const result = await attempt();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (operation === "history" || operation === "changes") {
      expect(result).toMatchObject({ status: "ok", result: expect.arrayContaining([expect.objectContaining({ content })]) });
    }
    expect(success(await h.a.store.read({ reference: h.reference })).content).toBe(operation === "write" ? changed : content);
    expect(success(await h.a.store.read({ reference: h.reference })).placement?.kind).toBe(operation === "reopen" ? "active" : "completed");
  });
  it("keeps both local copies on missing remote history, applies unrelated state, and retries the pending refresh", async () => {
    const h = await completedFixture(layout);
    const a = success(await h.a.store.read({ reference: h.reference })), b = success(await h.b.store.read({ reference: h.reference }));
    const localContent = `${a.content}\nUnpublished local completed write.\n`, remoteContent = `${b.content}\nRemote completed write.\n`;
    success(await h.a.store.write({ action: "put", reference: a.reference, expected: a.version,
      content: localContent, placement: { kind: "completed", quarter }, provenance }));
    success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version,
      content: remoteContent, placement: { kind: "completed", quarter }, provenance }));
    const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "unrelated.md", owner: { type: "person", name: "andrew" } });
    success(await h.b.store.write({ action: "put", reference: personal, expected: null, content: "Unrelated state applies.\n", provenance }));
    await h.b.git(["push", "--atomic", h.remoteName, `${h.archive}:${h.archive}`,
      "refs/arc/user/andrew/personal:refs/arc/user/andrew/personal"]);
    await h.remote("git", ["update-ref", "-d", h.history]);
    const history = (await h.a.git(["rev-parse", h.history])).stdout;
    const folder = (await h.a.git(["show", `${h.archive}:${h.folder}${h.metadataPath}`])).stdout;
    for (let n = 0; n < 2; n++) {
      const pulled = success(await h.a.store.pull());
      expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-pending", ref: h.history }));
      expect((await h.a.git(["rev-parse", h.history])).stdout).toBe(history);
      expect((await h.a.git(["show", `${h.archive}:${h.folder}${h.metadataPath}`])).stdout).toBe(folder);
      expect(success(await h.a.store.read({ reference: h.reference })).content).toBe(localContent);
    }
    expect(success(await h.a.store.read({ reference: personal })).content).toBe("Unrelated state applies.\n");
    await h.b.git(["push", h.remoteName, `${h.history}:${h.history}`]);
    success(await h.a.store.pull());
    const repaired = success(await h.a.store.read({ reference: h.reference }));
    expect(repaired.content).toBe(remoteContent);
    expect(repaired.conflicts).toHaveLength(1);
  });
  it.each([false, true])("rebuilds a folder from newer named history with the held ref missing: %s", async (missing) => {
    const h = await completedFixture(layout);
    const base = success(await h.b.store.read({ reference: h.reference }));
    const content = `${base.content}\nRestored from a later retained history.\n`;
    success(await h.b.store.write({ action: "put", reference: base.reference, expected: base.version,
      content, placement: { kind: "completed", quarter }, provenance }));
    await h.b.git(["push", h.remoteName, `${h.history}:${h.history}`]);
    if (missing) await h.a.git(["update-ref", "-d", h.history]);
    success(await h.a.store.pull({ history: [h.history] }));
    expect(success(await h.a.store.read({ reference: h.reference })).content).toBe(content);
    expect((await h.a.store.history({ reference: h.reference })).status).toBe("ok");
    expect((await h.a.git(["show", `${h.archive}:${h.folder}${h.metadataPath}`])).stdout)
      .toBe((await h.a.git(["show", `${h.history}:${h.metadataPath}`])).stdout);
  });
  it("fetches concurrent completed writes once into history and rebuilds the folder with the same conflict", async () => {
    const h = await completedFixture(layout);
    const a = success(await h.a.store.read({ reference: h.reference })), b = success(await h.b.store.read({ reference: h.reference }));
    const firstContent = `${a.content}\nFirst clone's completed write.\n`, publishedContent = `${b.content}\nPublished completed write.\n`;
    success(await h.a.store.write({ action: "put", reference: a.reference, expected: a.version,
      content: firstContent, placement: { kind: "completed", quarter }, provenance }));
    success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version,
      content: publishedContent, placement: { kind: "completed", quarter }, provenance }));
    success(await h.b.store.push());
    const published = (await h.remote("git", ["rev-parse", h.history])).stdout;
    const ended = JSON.parse((await h.a.git(["show", `${h.history}:${h.metadataPath}`])).stdout).endBatch;
    success(await h.a.store.pull());
    const merged = success(await h.a.store.read({ reference: h.reference }));
    expect(merged.content).toBe(publishedContent);
    expect(merged.conflicts).toHaveLength(1);
    const paths = (await h.a.git(["ls-tree", "-r", "--name-only", h.history])).stdout.split("\n");
    expect(paths.filter((path) => path.startsWith("conflicts/"))).toHaveLength(1);
    expect((await h.a.git(["show", `${h.archive}:${h.folder}${h.metadataPath}`])).stdout)
      .toBe((await h.a.git(["show", `${h.history}:${h.metadataPath}`])).stdout);
    const metadata = JSON.parse((await h.a.git(["show", `${h.history}:${h.metadataPath}`])).stdout);
    expect(metadata.endBatch).toBe(ended);
    for (const ref of [h.history, h.archive]) {
      expect((await h.a.git(["log", "-1", "--format=%B", ref])).stdout).toContain(`Arc-Batch: ${metadata.batch}`);
    }
    for (const path of paths.filter((path) => path.startsWith("conflicts/"))) {
      expect((await h.a.git(["show", `${h.archive}:${h.folder}${path}`])).stdout)
        .toBe((await h.a.git(["show", `${h.history}:${path}`])).stdout);
    }
    const tip = (await h.a.git(["rev-parse", h.history])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", published, tip]);
    const conflict = success(await h.a.store.read({ reference: merged.conflicts[0]! }));
    expect(conflict.content).toContain("First clone's completed write.");
    expect(conflict.content).toContain("Published completed write.");
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: h.reference })).conflicts).toHaveLength(1);
  });
});
