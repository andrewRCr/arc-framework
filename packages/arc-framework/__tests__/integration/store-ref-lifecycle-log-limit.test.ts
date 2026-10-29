import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema, HistoryRefSchema, type HistoryRef } from "../../src/lib/store/index.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it.each([false, true])("reads individually bounded lifecycle histories with a constrained aggregate buffer: %s", async constrained => {
  const h = await refSyncFixture();
  const made = [];
  for (let i = 0; i < 4; i += 1) {
    made.push(success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: `bounded-log-${i}` }, kind: "work-item/meta" }),
      content: makeMetaFixture(`bounded-log-${i}`), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } })));
  }
  success(await h.a.store.push()); success(await h.b.store.pull());
  const histories: HistoryRef[] = [];
  for (const item of made) {
    const current = success(await h.a.store.read({ reference: item.reference }));
    success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version, content: current.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    if (!("uid" in current.reference.owner)) throw new Error("Expected a work UID");
    histories.push(HistoryRefSchema.parse(`refs/arc/history/work/${current.reference.owner.uid}`));
  }
  success(await h.a.store.push());
  const tips = await Promise.all(histories.map(async ref => (await h.a.git(["rev-parse", ref])).stdout.trim()));
  const sizes = await Promise.all(tips.map(async tip => Buffer.byteLength(await h.a.ports.execInput(
    ["log", "--format=%H %P%n%B%x00", "--stdin"], `${tip}\n`, { cwd: h.a.root, objectAccess: "local-only" }))));
  const aggregate = await h.a.ports.execInput(["log", "--format=%H %P%n%B%x00", "--stdin"], `${tips.join("\n")}\n`, { cwd: h.a.root, objectAccess: "local-only" });
  const ceiling = Math.max(...sizes) + 128;
  expect(Buffer.byteLength(aggregate)).toBeGreaterThan(ceiling);
  const boundedInput = createExecaGitExecInput(ceiling);
  const store = createRefStore({ ...h.b.ports, execInput: (args, input, options) => constrained && args.includes("log")
    ? boundedInput(args, input, options) : h.b.ports.execInput(args, input, options) });
  const result = await store.pull({ history: histories });
  expect(result).toMatchObject({ status: "ok" });
  for (const item of made) expect(success(await store.read({ reference: item.reference })).placement?.kind).toBe("completed");
}, 90_000);

it("merges divergent completed histories whose separate logs fit the output ceiling", async () => {
  const h = await refSyncFixture(), provenance = { verb: "save", lifecycleAction: "save" };
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "bounded-merge" } }),
    content: makeMetaFixture("bounded-merge"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push());
  if (!("uid" in made.reference.owner)) throw new Error("Expected a work UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${made.reference.owner.uid}`);
  success(await h.b.store.pull({ history: [history] }));
  const left = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: made.reference.owner, key: "left" });
  const right = RecordReferenceSchema.parse({ ...left, key: "right" });
  success(await h.a.store.write({ action: "put", reference: left, expected: null, content: "Left content.\n", provenance }));
  success(await h.b.store.write({ action: "put", reference: right, expected: null, content: "Right content.\n", provenance }));
  success(await h.a.store.push());
  const tips = [(await h.a.git(["rev-parse", history])).stdout.trim(), (await h.b.git(["rev-parse", history])).stdout.trim()];
  await h.a.git(["fetch", "--no-tags", h.b.root, `${history}:refs/testing/bounded-right`]);
  const sizes = await Promise.all(tips.map(async tip => Buffer.byteLength((await h.a.git(["log", "--format=%B%x00", tip])).stdout)));
  const ceiling = Math.max(...sizes) + 16;
  expect(Buffer.byteLength((await h.a.git(["log", "--format=%B%x00", ...tips])).stdout)).toBeGreaterThan(ceiling);
  const rowSizes = await Promise.all(tips.map(async tip => Buffer.byteLength(await h.a.ports.execInput(
    ["log", "--format=%H %P%n%B%x00", "--stdin"], `${tip}\n`, { cwd: h.a.root, objectAccess: "local-only" }))));
  const rowCeiling = Math.max(...rowSizes) + 16;
  expect(Buffer.byteLength(await h.a.ports.execInput(["log", "--format=%H %P%n%B%x00", "--stdin"], `${tips.join("\n")}\n`,
    { cwd: h.a.root, objectAccess: "local-only" }))).toBeGreaterThan(rowCeiling);
  const bounded = createExecaGitExec(ceiling);
  const boundedInput = createExecaGitExecInput(rowCeiling);
  const store = createRefStore({ ...h.b.ports, exec: (command, args, options) => args.includes("--format=%B%x00")
    ? bounded(command, args, options) : h.b.ports.exec(command, args, options),
    execInput: (args, input, options) => args.includes("log") ? boundedInput(args, input, options) : h.b.ports.execInput(args, input, options) });
  expect(await store.pull({ history: [history] })).toMatchObject({ status: "ok" });
  expect(success(await store.read({ reference: left })).content).toBe("Left content.\n");
  expect(success(await store.read({ reference: right })).content).toBe("Right content.\n");
  const retry = success(await h.b.store.pull({ history: [history] }));
  expect(retry.pulls.every(({ status }) => status !== "failed"), JSON.stringify(retry)).toBe(true);
  expect(success(await h.b.store.read({ reference: left })).content).toBe("Left content.\n");
  expect(success(await h.b.store.read({ reference: right })).content).toBe("Right content.\n");
}, 90_000);
