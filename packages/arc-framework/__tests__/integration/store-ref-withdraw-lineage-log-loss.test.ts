/** Withdrawal lineage reads hold confirmed object loss while preserving other Git failures. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const registry = "refs/arc/project/registry";
const archive = { verb: "archive", lifecycleAction: "archive" };

async function competingEnds(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance: { verb: "save", lifecycleAction: "save" } }));
  const subject = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "subject" } }),
    content: makeMetaFixture("subject", { owner: "andrew" }), placement: { kind: "active" },
    provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  for (const [side, quarter] of [[h.a, "2027-q1"], [h.b, "2026-q4"]] as const) {
    const current = success(await side.store.read({ reference: subject.reference }));
    success(await side.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: current.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) }, provenance: archive }));
  }
  success(await h.b.store.push());
  if (subject.reference.owner.type !== "work-item" || !subject.reference.owner.uid) throw new Error("Expected subject generation");
  return { ...h, subject, path: `:(literal)lineage/${subject.reference.owner.uid}.json` };
}

it.each(["default", "separate"] as const)("restores an object lost at the lineage log boundary before retrying in %s", async layout => {
  const h = await competingEnds(layout), scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
  const history = expandStoredPath(h.subject.reference, { history: true }).ref;
  const before = (await h.a.git(["rev-parse", `${history}^{tree}`])).stdout.trim();
  let saved: Uint8Array | undefined, oid = "";
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    if (!saved && args.includes("--first-parent") && args.includes("--format=%B") && args.at(-1) === h.path) {
      oid = args[args.indexOf("--format=%B") + 1]!;
      saved = (await h.a.ports.rawExec([...scope, "cat-file", "commit", oid])).stdout;
      await removeLooseObject(h.a.root, oid, h.a.gitDir);
    }
    return h.a.ports.exec(command, args, options);
  } });
  try {
    const notices = success(await store.pull()).pulls.flatMap(outcome => outcome.notices);
    expect(saved).toBeDefined();
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: registry,
      condition: expect.stringContaining("The original lineage cannot be read:"), remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: history }));
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
    expect((await h.a.git(["rev-parse", `${history}^{tree}`])).stdout.trim()).toBe(before);
  } finally {
    if (saved) {
      const restored = await h.a.ports.rawExec([...scope, "hash-object", "-t", "commit", "-w", "--stdin"], { input: saved });
      expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    }
  }
  expect(success(await store.pull()).pulls.flatMap(outcome => outcome.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
}, 60_000);

it.each(["unrelated", "present-object", "canceled"] as const)("preserves %s lineage log failures and permits a healthy retry", async kind => {
  const h = await competingEnds("default"), tip = (await h.a.git(["rev-parse", registry])).stdout.trim();
  const error = makeGitProcessError({ command: "git", args: ["log", "--first-parent", "-1", "--format=%B", tip, "--", h.path],
    ...kind === "canceled" ? { isCanceled: true as const } : { exitCode: 128 },
    stderr: kind === "unrelated" ? "fatal: invalid log options\n" : `error: Could not read ${tip}\n` });
  let fail = true;
  const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    if (fail && args.includes("--first-parent") && args.includes("--format=%B") && args.at(-1) === h.path) {
      await h.a.ports.exec(command, args, options);
      throw error;
    }
    return h.a.ports.exec(command, args, options);
  } });
  await expect(store.pull()).rejects.toBe(error);
  fail = false;
  expect(success(await store.pull()).pulls.flatMap(outcome => outcome.notices))
    .toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.subject.reference.owner }));
}, 60_000);
