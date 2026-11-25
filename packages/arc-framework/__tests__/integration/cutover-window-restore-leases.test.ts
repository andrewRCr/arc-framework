/** Native admission preserves origin until every protected ref's exact value is settled. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { planRestoreFixture, recordRestoreFixture, restoreFixture } from "../helpers/cutover-window/restore.js";
import { seedTransients, transientSourceRef } from "../helpers/store/import-transients.js";
import { writeTreeCommit } from "../../src/lib/git/ref-tree.js";
import { saveImportPersonal } from "../helpers/store/import-fixture.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";

it("refuses moved and deleted origin refs before any push and admits exact accepted values", async () => {
  const h = await windowFixture();
  const held = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const moved = "refs/arc/delivery-candidates/example", deleted = "refs/arc/user/andrew/sync-state";
  await h.git("git", ["push", "origin", `HEAD:${moved}`, `HEAD:${deleted}`]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await h.git("git", ["push", "--atomic", `--force-with-lease=${moved}:${held}`, `--force-with-lease=${deleted}:${held}`,
    "origin", `${h.flip.head}:${moved}`, `:${deleted}`]);
  const origin = (await h.git("git", ["ls-remote", "origin"])).stdout;
  const refused = await planRestoreFixture(h);
  expect(refused).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: `origin:${moved}` }), expect.objectContaining({ subject: `origin:${deleted}` }),
  ]) } });
  for (const value of [moved, h.flip.head, deleted, "absent", "--accept"]) expect(refused.report).toContain(value);
  expect((await h.git("git", ["ls-remote", "origin"])).stdout).toBe(origin);
  expect(await planRestoreFixture(h, [`${moved}=${h.flip.head}`, `${deleted}=absent`])).toMatchObject({ exit: 0,
    result: { status: "reported", data: { origin: expect.arrayContaining([
      { ref: moved, current: h.flip.head, next: held }, { ref: deleted, current: null, next: held },
    ]), findings: [] } } });
  expect((await h.git("git", ["ls-remote", "origin"])).stdout).toBe(origin);
}, 30_000);

it("admits the configured identity's real published state and retired input", async () => {
  const h = await windowFixture();
  const held = await seedTransients(h, []);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await saveImportPersonal(h.root, false);
  expect(await invokeStoreRemote(["origin", "push"], { cwd: h.root })).toMatchObject({ result: { status: "ok" } });
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const origin = (await h.git("git", ["ls-remote", "origin"])).stdout;
  expect(await planRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported", data: {
    findings: [], origin: expect.arrayContaining([
      { ref: transientSourceRef, current: null, next: held },
      { ref: "refs/arc/project/registry", current: expect.stringMatching(/^[a-f0-9]{40,64}$/u), next: null },
      { ref: "refs/arc/user/andrew/personal", current: expect.stringMatching(/^[a-f0-9]{40,64}$/u), next: null },
    ]), local: expect.arrayContaining([{ ref: transientSourceRef, current: null, next: held }]),
  } } });
  expect((await h.git("git", ["ls-remote", "origin"])).stdout).toBe(origin);
}, 60_000);

it("refuses a local identity and an unrelated temporary ref changed after the saved decision", async () => {
  const h = await windowFixture();
  const held = await seedTransients(h, []);
  const temporary = "refs/arc/tmp/errand-close";
  const main = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["update-ref", temporary, main]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  expect(await recordRestoreFixture(h)).toMatchObject({ exit: 0 });
  const moved = await writeTreeCommit({ exec: h.git, execInput: h.ports.execInput }, transientSourceRef,
    new Map(), "Advance the empty identity", [held], held);
  await h.git("git", ["update-ref", temporary, h.flip.head, main]);
  const origin = (await h.git("git", ["ls-remote", "origin"])).stdout;
  const refused = await planRestoreFixture(h);
  expect(refused).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: `local:${transientSourceRef}` }), expect.objectContaining({ subject: `local:${temporary}` }),
  ]) } });
  expect((await h.git("git", ["ls-remote", "origin"])).stdout).toBe(origin);
  expect(await planRestoreFixture(h, [`${transientSourceRef}=${moved}`, `${temporary}=${h.flip.head}`])).toMatchObject({ exit: 0,
    result: { status: "reported", data: { local: expect.arrayContaining([
      { ref: transientSourceRef, current: moved, next: held }, { ref: temporary, current: h.flip.head, next: main },
    ]), findings: [] } } });
  expect((await h.git("git", ["ls-remote", "origin"])).stdout).toBe(origin);
}, 30_000);

it("finishes a restore once an origin ref's and a local ref's absence is accepted", async () => {
  const h = await windowFixture();
  const held = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const remote = "refs/arc/user/andrew/sync-state", local = "refs/arc/tmp/errand-close";
  await h.git("git", ["push", "origin", `HEAD:${remote}`]);
  await h.git("git", ["update-ref", local, held, ""]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await h.git("git", ["push", `--force-with-lease=${remote}:${held}`, "origin", `:${remote}`]);
  await h.git("git", ["update-ref", "-d", local, held]);
  expect(await restoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: `origin:${remote}` }), expect.objectContaining({ subject: `local:${local}` }),
  ]) } });
  expect(await restoreFixture(h, [`${remote}=absent`, `${local}=absent`])).toMatchObject({ exit: 0, result: { status: "passed" } });
  expect((await h.git("git", ["ls-remote", "origin", remote])).stdout).toContain(held);
  expect((await h.git("git", ["rev-parse", local])).stdout.trim()).toBe(held);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
}, 60_000);
