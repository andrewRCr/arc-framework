/** Native forwarding tracking locks retain typed recovery and release unrelated fetch keepers. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRefTestRepository, plantRef } from "../helpers/store/ref-plant.js";
import { makeGitExec } from "../helpers/integration.js";
import { success } from "../helpers/store/suite-tools.js";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(["files", "reftable"] as const)("refuses a forwarding tracking lock and resumes after unlock (%s)", async format => {
  const h = await createRefTestRepository(format);
  onTestFinished(h.cleanup);
  await h.exec("git", ["config", "arc.identity", "andrew"]);
  await h.exec("git", ["config", "core.filesRefLockTimeout", "0"]);
  const ports = createDefaultRefStorePorts({ checkoutRoot: h.root, backingRepository: async () => null });
  const base = createRefStore(ports), remote = makeGitExec(h.remote);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "kept.md", owner: { type: "person", name: "andrew" } });
  success(await base.write({ action: "put", reference, expected: null, content: "Retained state.\n",
    provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await base.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "project-registry/identity",
    owner: { type: "project", name: "project" } }), expected: null,
    content: JSON.stringify({ projectId: "34567890-1234-4234-8234-123456789abc" }), provenance: { verb: "init", lifecycleAction: "seed" } }));
  success(await base.push());
  const registryCommit = (await remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const { projectId } = JSON.parse((await remote("git", ["show", `${registryCommit}:identity.json`])).stdout) as { projectId: string };
  const ref = "refs/arc/project/moved", tracking = "refs/arc-remotes/origin/project/moved";
  const entries = [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit }) }];
  const first = await plantRef(h.remote, ref, entries, { gitDir: h.remote, message: "First forwarding root" });
  expect(success(await base.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  const second = await plantRef(h.remote, ref, entries, { gitDir: h.remote, message: "Replacement forwarding root" });
  expect(second.tip).not.toBe(first.tip);
  const lock = join(h.root, ".git", format === "files" ? `${tracking}.lock` : "reftable/tables.list.lock");
  let armed = true;
  const store = createRefStore({ ...ports,
    execInput: (args, input, options) => ports.execInput(args.map(arg =>
      arg.replace(/^(reftable\.lockTimeout|core\.filesRefLockTimeout)=5000$/u, "$1=0")), input, options),
    exec: async (command, args, options) => {
    if (armed && args.includes("fetch") && (options?.input?.split(/\r?\n/u) ?? []).some(arg => arg.includes(":refs/arc-remotes/origin/"))) {
      armed = false;
      await mkdir(dirname(lock), { recursive: true });
      await writeFile(lock, "Held native tracking lock\n");
    }
    return ports.exec(command, args, options);
  } });
  try {
    expect(await store.pull()).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
      remedy: { text: expect.stringContaining("retry") } } });
    expect(armed).toBe(false);
    expect((await h.exec("git", ["rev-parse", tracking])).stdout.trim()).toBe(first.tip);
    const retained = (await h.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/seen/origin/user/andrew/personal"])).stdout.trim();
    expect(retained).toBe(format === "files" ? "" : "refs/arc/tmp/seen/origin/user/andrew/personal");
  } finally { await rm(lock, { force: true }); }
  expect(success(await store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  expect((await h.exec("git", ["rev-parse", tracking])).stdout.trim()).toBe(second.tip);
  expect((await h.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/seen/origin/"])).stdout).toBe("");
  expect(success(await base.read({ reference })).content).toBe("Retained state.\n");
});
