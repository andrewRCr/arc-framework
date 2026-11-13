/** A passing check acquires the complete restore point from the explicit importing checkout. */
import { realpath, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WindowHostPort } from "../../src/scripts/cutover-window/host.js";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { seedTransients, transientSourceRef } from "../helpers/store/import-transients.js";
import { listWindowRefs } from "../../src/scripts/cutover-window/git.js";
import { WindowRefusal } from "../../src/scripts/cutover-window/result.js";
import { readWindowHold, discardUnfinishedWindowHold } from "../../src/scripts/cutover-window/hold.js";

it("records the flip, registered checkout, branch tips, and all three ref inventories", async () => {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const identity = await seedTransients(h, []);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const trackingRef = "refs/arc-remotes/origin/user/andrew/errands";
  await h.git("git", ["update-ref", trackingRef, identity]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  const held = await readWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(held.record).toEqual({ version: 1, reviewGateDigest: expect.stringMatching(/^[a-f0-9]{64}$/u), flip: h.flip,
    worktrees: [{ path: expect.any(String), head, branch: "main", personalDigest: expect.stringMatching(/^[a-f0-9]{64}$/u) }],
    branches: { live: expect.objectContaining({ main: { local: head, origin: head, reasons: expect.any(Array) },
      "feat/alpha": { local: head, origin: null, reasons: expect.any(Array) } }), local: { main: head, "feat/alpha": head, [h.flip.branch]: h.flip.head },
      origin: { main: head, [h.flip.branch]: h.flip.head } },
    refs: { local: { [transientSourceRef]: identity }, origin: { [transientSourceRef]: identity }, tracking: { [trackingRef]: identity } },
  });
  expect(await Promise.all(held.record.worktrees.map(row => realpath(row.path)))).toEqual([await realpath(h.root)]);
  expect((await h.git("git", ["rev-parse", "refs/arc-window/complete"])).stdout.trim()).toBe(held.tip);
  expect((await h.git("git", ["rev-parse", "refs/arc-window/origin/" + transientSourceRef])).stdout.trim()).toBe(identity);
  expect((await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
}, 30_000);


it("exposes acquired origin refs before the record write and a record before the marker write", async () => {
  const h = await windowFixture();
  const identity = await seedTransients(h, []);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const states: { step: string; origin: string | undefined; record: boolean; complete: boolean }[] = [];
  expect(await checkFixture(h, { step: async step => {
    const refs = await listWindowRefs({ repo: h.root, exec: h.git }, ["refs/arc-window/"]);
    states.push({ step, origin: refs.get("refs/arc-window/origin/" + transientSourceRef),
      record: refs.has("refs/arc-window/record"), complete: refs.has("refs/arc-window/complete") });
  } })).toMatchObject({ exit: 0, result: { status: "passed" } });
  expect(states).toEqual([
    { step: "check.record", origin: identity, record: false, complete: false },
    { step: "check.complete", origin: identity, record: true, complete: false },
  ]);
}, 30_000);

it("leaves an incomplete hold when stopped between the record and marker, then permits a fresh check after removal", async () => {
  const h = await windowFixture();
  const io = { repo: h.root, exec: h.git, execInput: h.ports.execInput };
  expect(await checkFixture(h, { step: step => {
    if (step === "check.complete") return Promise.reject(new Error("Window acquisition interrupted"));
    return Promise.resolve();
  } })).toMatchObject({ exit: 1, result: { status: "stopped" } });
  await expect(readWindowHold(io)).rejects.toMatchObject({ findings: [expect.objectContaining({ condition: expect.stringContaining("incomplete") })] });
  const refs = await listWindowRefs(io, ["refs/arc-window/"]);
  expect(refs.has("refs/arc-window/record")).toBe(true);
  expect(refs.has("refs/arc-window/complete")).toBe(false);
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused" } });
  expect(await listWindowRefs(io, ["refs/arc-window/"])).toEqual(refs);
  for (const [ref, tip] of refs) await h.git("git", ["update-ref", "-d", ref, tip]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);


it("cleans its acquired hold on an explicit refusal while preserving canonical refs", async () => {
  const h = await windowFixture();
  await seedTransients(h, []);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await checkFixture(h, { step: step => {
    if (step === "check.complete") return Promise.reject(new WindowRefusal([{ subject: "pre-marker condition",
      condition: "The window cannot continue.", remedy: "Repair the condition and retry." }]));
    return Promise.resolve();
  } })).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({ subject: "pre-marker condition" })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("never discards a completed hold as partial acquisition cleanup", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const io = { repo: h.root, exec: h.git, execInput: h.ports.execInput };
  const held = await readWindowHold(io);
  const refs = await listWindowRefs(io, ["refs/arc-window/"]);
  await expect(discardUnfinishedWindowHold(io)).rejects.toMatchObject({ findings: [expect.objectContaining({
    condition: expect.stringContaining("completion marker"), remedy: expect.stringContaining("Preserve"),
  })] });
  expect(await listWindowRefs(io, ["refs/arc-window/"])).toEqual(refs);
  expect(await readWindowHold(io)).toEqual(held);
}, 30_000);


it.each([{ headBranch: "feat/other", baseBranch: "main" }, { headBranch: "feat/window-flip", baseBranch: "other" }])(
  "refuses a flip request that does not identify the intended branch into main: %j", async target => {
    const h = await windowFixture();
    const original = await readFile(h.listingPath, "utf8");
    const request = { number: h.flip.pullRequest, ...target };
    await writeFile(h.listingPath, JSON.stringify({ open: [request], flip: { ...request, autoMergeArmed: false } }));
    expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
      subject: "flip pull request", remedy: expect.stringContaining("retry"),
    })] } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
    await writeFile(h.listingPath, original);
    expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  }, 30_000,
);

it("refuses supplied facts on a hosted remote before reading their file or any host facts", async () => {
  const h = await windowFixture();
  await h.git("git", ["remote", "set-url", "origin", "https://host.invalid/owner/repo.git"]);
  const host: WindowHostPort = {
    refs: async () => { throw new Error("Unexpected host read"); },
    pullRequests: async () => { throw new Error("Unexpected host read"); },
    mergeSettings: async () => { throw new Error("Unexpected host read"); },
    discoverRepository: async () => { throw new Error("Unexpected host read"); },
  };
  expect(await checkFixture({ ...h, listingPath: join(h.root, ".arc-fixture/missing.json") }, { host }))
    .toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({ subject: "host facts" })] } });
  await h.git("git", ["remote", "set-url", "origin", h.origin]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
