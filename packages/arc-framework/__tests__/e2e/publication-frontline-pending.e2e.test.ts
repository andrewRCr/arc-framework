/** Singleton prepublication exposes a runnable continuation for an admitted, unstarted frontline review. */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { FrontlineResolveRequestSchema } from "../../src/scripts/review-gate/policy/frontline-command-schema.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const RECOVERY_TIMEOUT_MS = 120_000;

it("replays its exact resolve input, preserves the admission, and can explicitly skip before execution", async ({ onTestFinished }) => {
  const root = await createTempRepo("arc-frontline-pending-");
  onTestFinished(() => cleanupTempDir(root));
  const initialized = await runArc(["init", "--yes", "--name", "example"], root);
  expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
  const configPath = join(root, ".arc", "system", "arc-config.yml");
  await writeFile(configPath, (await readFile(configPath, "utf8"))
    .replace("review.frontline_sources: []", "review.frontline_sources: [coderabbit-cli]"));
  const methodPath = join(root, ".arc", "system", "methods", "code-review-frontline.md");
  await writeFile(methodPath, (await readFile(methodPath, "utf8")).replace("active: false", "active: true"));
  await git(root, ["add", ".arc", ".gitignore", ".ignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/example"]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await mkdir(join(root, "src"));
  await writeFile(join(root, ".arc", "active", "meta-example.md"), makeMetaFixture("example", {
    owner: "test-user", branch: "feat/example", workClass: "Light", taskList: "tasks-example.md",
    lastCompleted: "verification", nextAction: "verification complete",
  }));
  await writeFile(join(root, ".arc", "active", "tasks-example.md"), "# Task List: Example\n\n- [x] Verification complete\n");
  await writeFile(join(root, "src", "example.ts"), "export const example = true;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  const attested = await runArc(["attest", "example", "--json"], root);
  expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
  await git(root, ["commit", "-m", "verification"]);

  const remote = join(root, ".git", "fixture-origin.git"), bin = join(root, ".git", "fixture-bin");
  await git(root, ["init", "--bare", remote]);
  const origin = "https://arc-fixture.example/arc-framework/example.git";
  await git(root, ["remote", "add", "origin", origin]);
  await git(root, ["config", `url.file://${remote}.insteadOf`, origin]);
  await mkdir(bin);
  await writeFile(join(bin, "gh"), "#!/bin/sh\nprintf '[]\\n'\n");
  await chmod(join(bin, "gh"), 0o755);
  const env = { GIT_TERMINAL_PROMPT: "0", PATH: `${bin}:${process.env.PATH ?? ""}` };
  const facts = join(root, ".git", "change-set.json"), lanes = join(root, ".git", "lanes.json");
  await writeFile(facts, JSON.stringify({ changeSetState: "known", contentKind: "code-bearing", reviewRisk: "sensitive",
    changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" }));
  const judgments = { frontline: { scopeMode: "whole-target" },
    standard: { scopeMode: "whole-target", terminus: { mode: "owner-accepted" } } };
  await writeFile(lanes, JSON.stringify(judgments));
  const prepublish = () => runArc(["review", "pre-publication", "example", "--self-review", "settled",
    "--change-set", facts, "--lanes", lanes], root, { env });
  const offered = await prepublish();
  expect(offered.exitCode, JSON.stringify(offered)).toBe(0);
  const action = JSON.parse(offered.stdout).nextAction as { command: string; request: unknown; resumeCommand?: string };
  expect(action.command).toBe("arc review frontline resolve -");
  const request = FrontlineResolveRequestSchema.parse(action.request);
  const invoke = (input: unknown) => runArcWithStdin(["review", "frontline", "resolve", "-"], root,
    JSON.stringify(input), { env });
  const ready = await invoke(request);
  expect(ready.exitCode, JSON.stringify(ready)).toBe(0);
  const admission = JSON.parse(ready.stdout).payload.admission as { operationId: string; logicalPass: number };
  expect(admission.logicalPass).toBe(1);
  await writeFile(lanes, JSON.stringify({ ...judgments, frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } } }));
  const refused = await prepublish();
  expect(refused.exitCode, JSON.stringify(refused)).toBe(1);
  const refusal = JSON.parse(refused.stdout) as { error: { code: string }; remedy: { argv: string[]; stdin?: unknown } };
  expect(refusal).toMatchObject({ error: { code: "review-in-progress" },
    remedy: { argv: ["arc", "review", "frontline", "resolve", "-"], stdin: request } });
  const carried = FrontlineResolveRequestSchema.parse(refusal.remedy.stdin);
  const resumed = await invoke(carried);
  expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
  expect(JSON.parse(resumed.stdout)).toMatchObject({ state: "ready", payload: { admission } });
  const skipped = await invoke({ ...carried, invocation: { mode: "skip" } });
  expect(skipped.exitCode, JSON.stringify(skipped)).toBe(0);
  expect(JSON.parse(skipped.stdout)).toMatchObject({ state: "skipped", nextAction: "none" });
  const resumeCommand = action.resumeCommand;
  expect(resumeCommand).toMatch(/^arc review pre-publication example --resume [A-Za-z0-9_-]+$/u);
  if (resumeCommand === undefined) throw new Error("Expected the original opaque continuation");
  const recovered = await runArc(resumeCommand.split(" ").slice(1), root, { env });
  expect(recovered.exitCode, JSON.stringify(recovered)).toBe(0);
  expect(JSON.parse(recovered.stdout)).toMatchObject({ locus: "candidate-publish-ready" });
}, RECOVERY_TIMEOUT_MS);
