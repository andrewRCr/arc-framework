/** Handoff paths and restating retain one selected frame while marker authority advances. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, execFileAsync } from "../helpers/integration.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { createWorktreeMarkerGeneration, replaceWorktreeMarkerGeneration } from "../../src/lib/git/worktree-marker.js";
import { createSessionStatusContext } from "../../src/handlers/status/session-context.js";
import { createHandoffProbes } from "../../src/handlers/status/session.js";
import { resolveAllSettings } from "../../src/lib/config/resolved-settings.js";

it("keeps a current record's projected context after a later marker change", async () => {
  const cwd = await createTempRepo("arc-handoff-cache-"); onTestFinished(() => cleanupTempDir(cwd));
  await execFileAsync("git", ["commit", "--allow-empty", "-m", "base"], { cwd });
  await execFileAsync("git", ["config", "arc.identity", "andrew"], { cwd });
  const h = createLifecycleHarness(); h.store.environment.identity = "andrew";
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "demo-project" })), "{}");
  for (const name of ["current", "advanced"]) {
    await h.seedMeta(name, { state: "Planning", currentWorkflow: "draft-design", owner: "andrew" });
    await mkdir(join(cwd, ".arc", "user", "andrew", name), { recursive: true });
  }
  const marker = { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00.000Z", createdFor: { kind: "work-unit" as const, name: "current" } };
  const created = await createWorktreeMarkerGeneration(cwd, marker);
  if (created.kind !== "created") throw new Error("Expected a new marker.");
  const boundary = createExecaGitExec();
  const exec: typeof boundary = (command, args, options) => boundary(command, args, { cwd, ...options });
  const raw = createExecaRawGitExec(cwd);
  const context = await createSessionStatusContext(cwd, exec, raw, raw, undefined, { store: h.store });
  const settings = resolveAllSettings({ cwd, exec, readFile: context.io.readFile });
  const probes = createHandoffProbes(context, settings);
  expect(await probes.sessionNotesPath()).toBe(join(cwd, ".arc", "active", "meta-current.md"));
  const replaced = await replaceWorktreeMarkerGeneration(cwd, created.bytes, { ...marker, createdFor: { kind: "work-unit", name: "advanced" } });
  expect(replaced.kind).toBe("replaced");
  expect((await probes.derivedLocusState("andrew")).active?.subject.key).toBe("current");
  expect(await probes.sessionNotesPath()).toBe(join(cwd, ".arc", "active", "meta-current.md"));
  expect(await probes.restateCandidates()).toMatchObject({ baselineSignal: "baseline-unknown" });
  const fresh = createHandoffProbes(context, settings);
  expect((await fresh.derivedLocusState("andrew")).active?.subject.key).toBe("advanced");
});
