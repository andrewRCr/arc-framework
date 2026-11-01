import { expect, it } from "vitest";

import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { identity, personal, projectId, provenance, switchFixture } from "../helpers/store/remote-move.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["code", "backing"] as const)("reports local code-repository loss during a migration from %s and resumes after restoration", async source => {
  const h = await switchFixture(source, source === "code" ? "backing" : "code");
  const ref = "refs/heads/local-fetch-loss";
  const { tip } = await plantRef(h.a.root, ref, [], { message: "Independent code tip for migration fetch" });
  const bytes = (await h.a.ports.rawExec(["cat-file", "commit", tip])).stdout;
  const sourceRefs = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  let armed = true;
  const ports = { ...h.ports, migrateStep: async (step: string) => {
    if (!armed || step !== "remote.fetch-source") return;
    armed = false;
    await removeLooseObject(h.a.root, tip);
  } };
  const result = await invokeStoreMigrate(["--to", h.to], ports);
  expect(armed).toBe(false);
  expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "refused", class: "terminal", condition: expect.stringContaining(ref),
    remedy: { text: expect.stringMatching(/restore/iu) },
  } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(sourceRefs);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/remote/"])).stdout).toBe("");
  const restored = await h.a.ports.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(tip);
  expect((await invokeStoreMigrate(["--to", h.to], ports)).status).toBe("ok");
  expect(success(await h.store.read({ reference: personal })).content).toBe("Shared state.\n");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
}, 60_000);

it.each(["automatic", "setting"] as const)("reports local loss during a %s project check without setting a role and resumes after restoration", async entry => {
  const h = await refSyncFixture();
  for (const side of [h.a, h.b]) success(await side.store.write({ action: "put", reference: identity, expected: null,
    content: JSON.stringify({ projectId }), provenance }));
  success(await h.a.store.push());
  await h.b.git(["config", "--unset", "remote.origin.arc-state"]);
  const ref = "refs/heads/local-project-fetch-loss";
  const { tip } = await plantRef(h.b.root, ref, [], { message: "Independent code tip for candidate fetch" });
  const bytes = (await h.b.ports.rawExec(["cat-file", "commit", tip])).stdout;
  const before = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout;
  await removeLooseObject(h.b.root, tip);
  const invoke = async () => entry === "automatic" ? h.b.store.pull()
    : (await invokeStoreRemote(["origin", "push"], { cwd: h.b.root, ports: h.b.ports })).result;
  const result = await invoke();
  const failure = { code: "refused", class: "terminal", condition: expect.stringContaining(ref),
    remedy: { text: expect.stringMatching(/restore/iu) } };
  if (entry === "automatic") expect(result).toMatchObject({ status: "ok", result: {
    states: [], pulls: [{ remote: "origin", role: "candidate", status: "failed", failure }],
  } });
  else expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: failure } });
  expect((await h.b.git(["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
  expect((await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout).toBe(before);
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
  const restored = await h.b.ports.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(tip);
  const retried = await invoke();
  if (entry === "automatic") expect(retried).toMatchObject({ status: "ok", result: { pulls: [{ status: "pulled" }] } });
  else expect(retried.status).toBe("ok");
  expect((await h.b.git(["config", "remote.origin.arc-state"])).stdout).toBe("push");
  expect(success(await h.b.store.read({ reference: identity })).content).toContain(projectId);
}, 60_000);
