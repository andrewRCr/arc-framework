/** Refreshing an unnumbered completed item must preserve every independent end. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "save", lifecycleAction: "save" };

async function independentEnds(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, placement: { kind: "active" },
    reference: RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name: "first-name" } }),
    content: JSON.stringify({ body: "Original errand." }), provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const first = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: first.reference, expected: first.version,
    placement: { kind: "completed", quarter }, content: first.content, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push());
  // Mirror loss lets the other clone publish its independently named end, retaining the shared registry history.
  const erased = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  for (const ref of erased.filter(ref => ref !== "refs/arc/project/registry")) await h.remote("git", ["update-ref", "-d", ref]);
  const right = success(await h.b.store.read({ reference: made.reference }));
  const renamed = RecordReferenceSchema.parse({ ...right.reference, owner: { ...right.reference.owner, name: "second-name" } });
  success(await h.b.store.write({ action: "put", reference: renamed, expected: right.version, placement: { kind: "active" },
    content: right.content, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const second = success(await h.b.store.read({ reference: renamed }));
  success(await h.b.store.write({ action: "put", reference: second.reference, expected: second.version,
    placement: { kind: "completed", quarter }, content: second.content, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.b.store.push());
  const uid = "uid" in made.reference.owner ? made.reference.owner.uid : undefined;
  if (!uid) throw new Error("The independently ended item has no UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${uid}`), archive = `refs/arc/archive/${quarter}`;
  let pulled = success(await h.a.store.pull());
  for (const notice of pulled.pulls.flatMap(row => row.notices)) {
    if (notice.kind !== "history-diverged") continue;
    const lines = notice.remedy.text.slice(notice.remedy.text.indexOf("Merge both")).split("\n").slice(1);
    for (const line of lines) {
      if (!line.startsWith("'git'")) break;
      const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
      await h.a.exec("git", argv.slice(1), { cwd: h.a.root });
    }
  }
  pulled = success(await h.a.store.pull());
  expect(pulled.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "ended-twice" }));
  // An explicit native merge retains both real end commits and the first folder's current record tree.
  const fetched = "refs/test/independent-end-history";
  await h.a.git(["fetch", "--refmap=", "--no-tags", "--", h.remoteName, `+${history}:${fetched}`]);
  const retained = (await h.a.git(["rev-parse", history])).stdout.trim();
  const incoming = (await h.a.git(["rev-parse", fetched])).stdout.trim();
  const tree = (await h.a.git(["rev-parse", `${retained}^{tree}`])).stdout.trim();
  const merged = (await h.a.ports.execInput([...h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [],
    "-c", "user.name=Native history repair", "-c", "user.email=repair@example.test", "commit-tree", tree,
    "-p", retained, "-p", incoming], "Merge both independent end histories\n", { cwd: h.a.root })).trim();
  await h.a.git(["update-ref", history, merged, retained]);
  await h.a.git(["update-ref", "-d", fetched]);
  const ends = async () => {
    const paths = (await h.a.git(["ls-tree", "-r", "--name-only", archive])).stdout.split("\n")
      .filter(path => path.endsWith(`/metadata-${uid}.json`));
    return Promise.all(paths.map(async path => ({ path, metadata: JSON.parse((await h.a.git(["show", `${archive}:${path}`])).stdout) as { endBatch: string } })));
  };
  const captured = await ends();
  expect(captured).toHaveLength(2); expect(new Set(captured.map(row => row.metadata.endBatch)).size).toBe(2);
  return { ...h, history, archive, reference: renamed, ends, captured };
}

it.each(["default", "separate"] as const)("refuses a same-role completed rename before refs change and permits reopen/end-once repair in %s", async layout => {
  const h = await independentEnds(layout);
  const current = success(await h.a.store.read({ reference: h.reference }));
  const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const reference = RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name: "third-name" } });
  const result = await h.a.store.write({ action: "put", reference, expected: current.version, content: current.content,
    placement: { kind: "completed", quarter }, provenance: { verb: "rename", lifecycleAction: "rename" } });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.ended-twice-placement",
    condition: expect.stringContaining("independent"), remedy: { text: expect.stringMatching(/reopen.*once/iu) } } });
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  expect(await h.ends()).toEqual(h.captured);
  success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version, content: current.content,
    placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  const reopened = success(await h.a.store.read({ reference: current.reference }));
  success(await h.a.store.write({ action: "put", reference, expected: reopened.version, content: reopened.content,
    placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  expect(await h.ends()).toHaveLength(1);
  expect(success(await h.a.store.read({ reference })).placement).toEqual({ kind: "completed", quarter });
});

it.each(["default", "separate"] as const)("holds a shared history refresh that would collapse independent same-role ends in %s", async layout => {
  const h = await independentEnds(layout);
  const current = success(await h.a.store.read({ reference: h.reference }));
  const fetched = "refs/test/history-edit";
  await h.b.git(["fetch", "--refmap=", "--no-tags", h.a.gitDir ?? h.a.root, `${h.history}:${fetched}`]);
  const parent = (await h.b.git(["rev-parse", fetched])).stdout.trim();
  const home = expandStoredPath(current.reference);
  const entries = (await h.b.git(["ls-tree", "-r", "-z", fetched])).stdout.split("\0").filter(Boolean).map((row): PlantTreeEntry => {
    const match = /^100644 blob ([0-9a-f]+)\t(.*)$/su.exec(row);
    if (!match?.[1] || !match[2]) throw new Error("A native history edit needs regular record blobs");
    return match[2] === home.path ? { path: match[2], content: JSON.stringify({ body: "A native later history edit." }) }
      : { path: match[2], mode: "100644", oid: match[1] };
  });
  await plantRef(h.b.root, h.history, entries, { gitDir: h.b.gitDir, parents: [parent], message: "Edit retained record bytes\n" });
  await h.b.git(["push", h.remoteName, `${h.history}:${h.history}`]);
  const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const pulled = success(await h.a.store.pull({ history: [h.history] }));
  expect(pulled.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history,
    condition: expect.stringContaining("independent"), remedy: { text: expect.stringMatching(/reopen.*once/iu) } }));
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  expect(await h.ends()).toEqual(h.captured);
  success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version, content: current.content,
    placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  const reopened = success(await h.a.store.read({ reference: current.reference }));
  success(await h.a.store.write({ action: "put", reference: reopened.reference, expected: reopened.version, content: reopened.content,
    placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  expect(await h.ends()).toHaveLength(1);
});
