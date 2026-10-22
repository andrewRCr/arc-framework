/** Remote moves resume their layout halves without replacing the enclosing copy or observed heads. */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { identity, oppositeMoveFixture, personal, provenance, switchFixture, type Endpoint } from "../helpers/store/remote-move.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

const layoutCases = ([{ source: "code", destination: "backing" }, { source: "backing", destination: "code" }] as const)
  .flatMap(direction => ["layout.rename", "layout.delete"].map(boundary => ({ ...direction, boundary })));

it.each(layoutCases)("restarts $source to $destination at $boundary with its copied heads and matching trial", async ({ source, destination, boundary }) => {
  const h = await switchFixture(source, destination);
  const trial = await invokeStoreMigrate(["--to", h.to, "--trial"], h.ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === boundary) throw new Error("Paused layout half");
  } })).rejects.toThrow("Paused layout half");
  const recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout) as { kind: string; registryCommit: string };
  expect(recorded.kind).toBe("remote");
  for (const root of ["refs/arc/tmp/migrate/remote/", "refs/arc/tmp/migrate/layout/", "refs/arc/tmp/migrate/copied/"]) {
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", root])).stdout.trim()).not.toBe("");
  }
  const during = RecordReferenceSchema.parse({ ...personal, key: "during-layout.md" });
  success(await h.store.write({ action: "put", reference: during, expected: null, content: "Written while the layout move was paused.\n", provenance }));
  const moved = await invokeStoreMigrate([], h.ports);
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect(success(await h.store.read({ reference: during })).content).toBe("Written while the layout move was paused.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", recorded.registryCommit, "refs/arc/project/registry"]);
  for (const [index, root] of [`refs/arc-remotes/${h.destinationName}/`, `refs/arc/tmp/seen/${h.destinationName}/`].entries()) {
    expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", root])).stdout.trim().split("\n").filter(Boolean).map(row => row.slice(root.length)).sort()).toEqual(h.heads[index]);
  }
  const directories = await readdir(join(h.a.root, ".git", "arc"));
  expect(directories).not.toContain("store-migrate-old");
  expect(directories).not.toContain("store-migrate-build");
  if (destination === "code") expect(directories).not.toContain("store");
  else expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/", "refs/arc/user/"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  if (trial.status === "ok" && moved.status === "ok") {
    const rows = (refs: typeof trial.result.refs) => refs.map(row => JSON.stringify(row)).sort();
    expect(rows(trial.result.refs)).toEqual(rows(moved.result.refs));
    expect(trial.result.notices).toEqual(moved.result.notices);
  }
}, 60_000);

it.each(["copied", "forwarded", "switched", "overtaken", "switched then overtaken"] as const)("keeps a %s recorded move and its copied heads intact during trial", async state => {
  const h = await oppositeMoveFixture();
  const paused = state === "copied" ? "remote.copied" : state.startsWith("switched") ? "remote.switched" : "remote.forwarded";
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === paused) throw new Error("Paused recorded move");
  } })).rejects.toThrow("Paused recorded move");
  if (state.endsWith("overtaken")) expect((await invokeStoreMigrate(["--to", h.origin], h.peerPorts)).status).toBe("ok");
  const retained = (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/move", "refs/arc/tmp/migrate/copied/"])).stdout;
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const config = await readFile(h.config, "utf8");
  const trial = await invokeStoreMigrate(["--to", h.to, "--trial"], h.ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/move", "refs/arc/tmp/migrate/copied/"])).stdout).toBe(retained);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect(await readFile(h.config, "utf8")).toBe(config);
  if (state.endsWith("overtaken") && trial.status === "ok") expect(trial.result.refs.some(row => row.action === "delete")).toBe(false);
  if (state === "switched then overtaken" && trial.status === "ok") {
    expect(trial.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("after its switch") }));
    expect(trial.result.notices.some(({ condition }) => condition.includes(`published at ${h.destinationDirectory}`))).toBe(false);
  }
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it.each(["foreign", "unreachable"] as const)("leaves no record after a %s first destination and succeeds with the right target", async failure => {
  const h = await switchFixture();
  let target = join(h.a.root, "mistyped.git");
  if (failure === "foreign") {
    const other = await refSyncFixture();
    success(await other.a.store.write({ action: "put", reference: identity, expected: null,
      content: JSON.stringify({ projectId: "45678901-1234-4234-8234-123456789abc" }), provenance }));
    success(await other.a.store.push());
    target = other.origin;
  }
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const config = await readFile(h.config, "utf8");
  expect(await invokeStoreMigrate(["--to", target], h.ports)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: failure === "foreign" ? "identity-mismatch" : "unreachable",
  } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect(await readFile(h.config, "utf8")).toBe(config);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  const repaired = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect(repaired.status, JSON.stringify(repaired)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
}, 60_000);

it.each(["backing", "code"] as Endpoint[])("finishes a switched backing-to-%s move without target after syncing and refusing another target", async destination => {
  const h = await switchFixture("backing", destination);
  const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  await h.remote("git", ["push", "--atomic", h.destinationDirectory, ...refs.map(ref => `${ref}:${ref}`)]);
  const trial = await invokeStoreMigrate(["--to", h.to, "--trial"], h.ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused switched move");
  } })).rejects.toThrow("Paused switched move");
  const record = (await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/move"])).stdout;
  const config = await readFile(h.config, "utf8");
  expect(await invokeStoreMigrate(["--to", join(h.a.root, "another.git")], h.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  expect((await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/move"])).stdout).toBe(record);
  expect(await readFile(h.config, "utf8")).toBe(config);
  expect(success(await h.store.pull()).states).toContainEqual(expect.objectContaining({ status: "move-unfinished" }));
  const published = success(await h.store.push());
  expect(published.states).toContainEqual(expect.objectContaining({ status: "move-unfinished" }));
  expect(published.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const completed = await invokeStoreMigrate([], h.ports);
  expect(completed.status, JSON.stringify(completed)).toBe("ok");
  if (completed.status === "ok" && trial.status === "ok") {
    const rows = (report: typeof trial.result) => report.refs.map(row => JSON.stringify(row)).sort();
    expect(rows(completed.result)).toEqual(rows(trial.result));
  }
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Pending local state.");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect(success(await h.store.pull()).states).toEqual([]);
}, 60_000);
