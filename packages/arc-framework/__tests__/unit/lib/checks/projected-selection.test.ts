/** Reader behavior at the lazy capability and literal process boundaries. */
import { afterEach, expect, it } from "vitest";
import { readProjectedSelection, type ProjectedSelectionIO } from "../../../../src/lib/checks/projected-selection.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";

const path = ".arc/active/current/notes-alpha.md";
const forbiddenRun: ProjectedSelectionIO["run"] = () => Promise.reject(new Error("No subprocess is permitted"));
afterEach(() => { beginProjectionCommand(); });

it.each([false, true])("reads a script's literal selection command with changed=%s", async changed => {
  const root = "/selected-checkout";
  const result = await readProjectedSelection(root, { changed }, {
    createStore: () => ({ capabilities: { stateOffBranch: true } }),
    run: async (command, args, cwd) => command === "npx" && cwd === root
      && JSON.stringify(args) === JSON.stringify(["arc", "selection", "--json", ...(changed ? ["--changed"] : [])])
      ? { exitCode: 0, stdout: JSON.stringify({ paths: [path] }), stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "Incorrect checkout or selection arguments" },
  });
  expect(result).toEqual({ status: "ok", paths: [path] });
});

it("returns the in-repo script capability's empty selection without a subprocess", async () => {
  expect(await readProjectedSelection("/unused", { changed: true }, { run: forbiddenRun })).toEqual({ status: "ok", paths: [] });
});

it("returns empty after a disabled start without recomposing or launching a subprocess", async () => {
  const root = "/command-checkout", store = createStore(createDefaultStorePorts({ checkoutRoot: root }));
  expect(await startProjection({ store, checkout: root })).toEqual({ kind: "disabled" });
  expect(await readProjectedSelection(root, { changed: false }, {
    createStore: () => { throw new Error("The completed command already chose its Store"); }, run: forbiddenRun,
  })).toEqual({ status: "ok", paths: [] });
});

it("retains a skipped command's refusal and succeeds after a normal start", async () => {
  const root = "/command-checkout", store = createStore(createDefaultStorePorts({ checkoutRoot: root }));
  await startProjection({ store, checkout: root, skipProjection: true });
  expect(await readProjectedSelection(root, { changed: true }, { run: forbiddenRun })).toEqual({ status: "unavailable",
    reason: "projection-skipped: Projection skipped by --skip-projection.\nRun the command without --skip-projection to take in its pending edits." });
  await startProjection({ store, checkout: root });
  expect(await readProjectedSelection(root, { changed: true }, { run: forbiddenRun })).toEqual({ status: "ok", paths: [] });
});

it("does not borrow another checkout's completed start", async () => {
  const store = createStore(createDefaultStorePorts({ checkoutRoot: "/checkout-a" }));
  await startProjection({ store, checkout: "/checkout-a" });
  const result = await readProjectedSelection("/checkout-b", { changed: false }, {
    createStore: root => ({ capabilities: { stateOffBranch: root === "/checkout-b" } }),
    run: async (_command, _args, root) => ({ exitCode: 0, stdout: JSON.stringify({ paths: [`.arc/user/andrew/${root.slice(1)}.md`] }), stderr: "" }),
  });
  expect(result).toEqual({ status: "ok", paths: [".arc/user/andrew/checkout-b.md"] });
});

it("refuses a command whose start is still incomplete, then reads after completion", async () => {
  const root = "/command-checkout", store = createStore(createDefaultStorePorts({ checkoutRoot: root }));
  const pending = startProjection({ store, checkout: root });
  const reading = readProjectedSelection(root, { changed: false }, { run: forbiddenRun });
  await pending;
  expect(await reading).toMatchObject({ status: "unavailable", reason: expect.stringContaining("projection-not-started") });
  expect(await readProjectedSelection(root, { changed: false }, { run: forbiddenRun })).toEqual({ status: "ok", paths: [] });
});

const badOutputs = [
  { name: "command refusal", exitCode: 1, stdout: JSON.stringify({ status: "refused", refusal: {
    code: "projection-skipped", condition: "Projection lock held by holder-one.", remedy: { text: "Retry after holder-one releases its lock." },
  } }), stderr: "", reason: "projection-skipped: Projection lock held by holder-one.\nRetry after holder-one releases its lock." },
  { name: "stale build", exitCode: 1, stdout: "", stderr: "error: arc dev build is stale; run npm run build:fast, then retry.", reason: "arc dev build is stale" },
  { name: "nonzero with otherwise valid paths", exitCode: 1, stdout: JSON.stringify({ paths: [path] }), stderr: "command did not complete", reason: "command did not complete" },
  { name: "invalid JSON", exitCode: 0, stdout: "not json", stderr: "", reason: "invalid JSON path list" },
  { name: "missing paths", exitCode: 0, stdout: "{}", stderr: "", reason: "invalid JSON path list" },
  { name: "non-string path", exitCode: 0, stdout: '{"paths":[42]}', stderr: "", reason: "invalid JSON path list" },
  { name: "escaping path", exitCode: 0, stdout: '{"paths":["../outside.md"]}', stderr: "", reason: "invalid JSON path list" },
];
it.each(badOutputs)("retains $name as unavailable and succeeds after repair", async bad => {
  let repaired = false;
  const io: ProjectedSelectionIO = { createStore: () => ({ capabilities: { stateOffBranch: true } }),
    run: async () => repaired ? { exitCode: 0, stdout: JSON.stringify({ paths: [path] }), stderr: "" } : bad };
  expect(await readProjectedSelection("/script-checkout", { changed: true }, io)).toMatchObject({ status: "unavailable", reason: expect.stringContaining(bad.reason) });
  repaired = true;
  expect(await readProjectedSelection("/script-checkout", { changed: true }, io)).toEqual({ status: "ok", paths: [path] });
});

it("retains a process launch failure and succeeds on retry", async () => {
  let repaired = false;
  const io: ProjectedSelectionIO = { createStore: () => ({ capabilities: { stateOffBranch: true } }), run: async () => {
    if (!repaired) throw new Error("npx could not be launched");
    return { exitCode: 0, stdout: JSON.stringify({ paths: [path] }), stderr: "" };
  } };
  expect(await readProjectedSelection("/script-checkout", { changed: false }, io)).toEqual({ status: "unavailable", reason: "Error: npx could not be launched" });
  repaired = true;
  expect(await readProjectedSelection("/script-checkout", { changed: false }, io)).toEqual({ status: "ok", paths: [path] });
});
