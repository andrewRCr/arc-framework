/** Every target-state step restarts from the complete hold until final marker deletion. */
import { expect, it } from "vitest";
import { restorableWindow, expectRestoredWindow } from "../helpers/cutover-window/restore-case.js";
import { restoreFixture } from "../helpers/cutover-window/restore.js";
import { readWindowRefTip, listWindowRefs } from "../../src/scripts/cutover-window/git.js";
import { discardUnfinishedWindowHold } from "../../src/scripts/cutover-window/hold.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { writeTreeCommit } from "../../src/lib/git/ref-tree.js";
import { transientSourceRef } from "../helpers/store/import-transients.js";

const restartSteps = ["restore.compare-record", "restore.origin", "restore.local", "restore.configuration", "restore.verify", "restore.hold"] as const;
it.each(restartSteps.flatMap(step => [[step, "after"], [step, "before"]] as const))(
  "finishes when restarted after interruption at %s, %s publication", async (stopping, publication) => {
    const h = await restorableWindow(publication === "before");
    expect(await restoreFixture(h, [], { step: step => step === stopping ? Promise.reject(new Error("pause-restore")) : Promise.resolve() }))
      .toMatchObject({ exit: 1, result: { status: "stopped" } });
    expect(await readWindowRefTip(h.io, "refs/arc-window/complete")).not.toBeNull();
    expect(await restoreFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
    await expectRestoredWindow(h);
  }, 60_000,
);

it("leaves an incomplete hold after marker deletion and resumes through explicit cleanup", async () => {
  const h = await restorableWindow();
  expect(await restoreFixture(h, [], { step: step => step === "restore.hold.marker-deleted"
    ? Promise.reject(new Error("pause-after-marker")) : Promise.resolve() })).toMatchObject({ exit: 1, result: { status: "stopped" } });
  expect(await readWindowRefTip(h.io, "refs/arc-window/complete")).toBeNull();
  expect(await readWindowRefTip(h.io, "refs/arc-window/record")).not.toBeNull();
  expect(await restoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    condition: expect.stringContaining("incomplete"), remedy: expect.stringContaining("Remove"),
  })] } });
  await discardUnfinishedWindowHold(h.io);
  await expectRestoredWindow(h);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
}, 60_000);

it("preserves origin when a held source changed and finishes after the hold is repaired", async () => {
  const h = await restorableWindow();
  const source = `refs/arc-window/origin/${transientSourceRef}`;
  await h.git("git", ["update-ref", source, h.flip.head, h.held]);
  const originIO = { repo: h.origin, exec: h.remote };
  const before = await listWindowRefs(originIO, ["refs/arc/"]);
  expect(await restoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: source, remedy: expect.stringContaining("repair"),
  })] } });
  expect(await listWindowRefs(originIO, ["refs/arc/"])).toEqual(before);
  expect(await readWindowRefTip(h.io, "refs/arc-window/complete")).not.toBeNull();
  await h.git("git", ["update-ref", source, h.held, h.flip.head]);
  expect(await restoreFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  await expectRestoredWindow(h);
}, 60_000);

it("retains the complete hold when verification finds a late ref and finishes after its value is accepted", async () => {
  const h = await restorableWindow();
  const ref = "refs/arc/tmp/errand-close";
  expect(await restoreFixture(h, [], { step: async step => {
    if (step === "restore.verify") await h.git("git", ["update-ref", ref, h.flip.head, ""]);
  } })).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: `local:${ref}`, condition: expect.stringContaining("verification"),
  })] } });
  expect(await readWindowRefTip(h.io, ref)).toBe(h.flip.head);
  expect(await readWindowRefTip(h.io, "refs/arc-window/complete")).not.toBeNull();
  expect(await restoreFixture(h, [`${ref}=${h.flip.head}`])).toMatchObject({ exit: 0, result: { status: "passed" } });
  await expectRestoredWindow(h);
}, 60_000);

it("keeps every local ref when an identity races its reset and finishes once its new tip is accepted", async () => {
  const h = await restorableWindow();
  const before = await listWindowRefs(h.io, ["refs/arc/", "refs/arc-remotes/origin/"]);
  let moved = "";
  expect(await restoreFixture(h, [], { step: async step => {
    if (step === "restore.local") moved = await writeTreeCommit(h.io, transientSourceRef, new Map(),
      "Write a new empty identity after admission", [h.held], null);
  } })).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({ subject: `local:${transientSourceRef}` })] } });
  before.set(transientSourceRef, moved);
  expect(await listWindowRefs(h.io, ["refs/arc/", "refs/arc-remotes/origin/"])).toEqual(before);
  expect(await restoreFixture(h, [`${transientSourceRef}=${moved}`])).toMatchObject({ exit: 0, result: { status: "passed" } });
  await expectRestoredWindow(h);
}, 60_000);

it("preserves a new origin value when its lease changes after admission and finishes once accepted", async () => {
  const h = await restorableWindow();
  const registry = "refs/arc/project/registry";
  const before = (await h.remote("git", ["rev-parse", registry])).stdout.trim();
  const local = await listWindowRefs(h.io, ["refs/arc/", "refs/arc-remotes/origin/"]);
  expect(await restoreFixture(h, [], { step: async step => {
    if (step === "restore.origin") await h.git("git", ["push", `--force-with-lease=${registry}:${before}`, "origin", `${h.flip.head}:${registry}`]);
  } })).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({ subject: `origin:${registry}` })] } });
  expect(await readWindowRefTip({ repo: h.origin, exec: h.remote }, registry)).toBe(h.flip.head);
  expect(await listWindowRefs(h.io, ["refs/arc/", "refs/arc-remotes/origin/"])).toEqual(local);
  expect(await restoreFixture(h, [`${registry}=${h.flip.head}`])).toMatchObject({ exit: 0, result: { status: "passed" } });
  await expectRestoredWindow(h);
}, 60_000);

it.each(["restore.merged.push", "restore.merged.registry"] as const)("keeps the local store whole when the flip merges at %s", async boundary => {
  const h = await restorableWindow();
  const local = await listWindowRefs(h.io, ["refs/arc/", "refs/arc-remotes/origin/"]);
  const originIO = { repo: h.origin, exec: h.remote };
  const origin = await listWindowRefs(originIO, ["refs/arc/"]);
  const registry = await readWindowRefTip(originIO, "refs/arc/project/registry");
  expect(await restoreFixture(h, [], { step: async step => {
    if (step === boundary) await h.git("git", ["push", "origin", `${h.flip.head}:refs/heads/main`]);
  } })).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "merged flip", remedy: expect.stringContaining(boundary === "restore.merged.registry" ? "migrate --import" : "Fix forward"),
  })] } });
  expect(await listWindowRefs(h.io, ["refs/arc/", "refs/arc-remotes/origin/"])).toEqual(local);
  expect(await readWindowRefTip(originIO, "refs/arc/project/registry")).toBe(registry);
  expect(await readWindowRefTip(h.io, "refs/arc-window/complete")).not.toBeNull();
  if (boundary === "restore.merged.push") expect(await listWindowRefs(originIO, ["refs/arc/"])).toEqual(origin);
  else expect(await listWindowRefs(originIO, ["refs/arc/"])).toEqual(new Map([
    ...Object.entries(h.record.refs.origin), ["refs/arc/project/registry", registry],
  ]));
}, 60_000);

it("retries a tracking ref that races its reset without an acceptance", async () => {
  const h = await restorableWindow();
  const tracking = [...await listWindowRefs(h.io, ["refs/arc-remotes/origin/"])]
    .find(([ref, tip]) => h.record.refs.tracking[ref] !== tip);
  if (tracking === undefined) throw new Error("The publication changed no tracking ref.");
  const [ref, published] = tracking;
  const refused = await restoreFixture(h, [], { step: async step => {
    if (step === "restore.local") await h.git("git", ["update-ref", ref, h.flip.head, published]);
  } });
  expect(refused).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: `local:${ref}`, remedy: expect.stringContaining("retry restore"),
  })] } });
  expect(refused.report).not.toContain(`--accept ${ref}`);
  expect(await restoreFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  await expectRestoredWindow(h);
}, 60_000);
