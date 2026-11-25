/** E2E setup provides usable pinned native hook-manager executables. */
import { expect, inject, it } from "vitest";
import { execa } from "execa";
import { coerce, gte } from "semver";
import type { HookManagerTools } from "../helpers/hook-manager-tools.js";

it("provides both usable native hook managers", async () => {
  const tools: HookManagerTools | undefined = inject("arcHookManagerTools");
  expect(tools).toBeDefined();
  if (!tools) throw new Error("Hook-manager E2E provisioning failed: setup did not provide tools");
  const lefthook = await execa(tools.lefthook, ["version"]);
  const version = coerce(lefthook.stdout);
  expect(version && gte(version, "2.2.1")).toBe(true);
  const preCommit = await execa(tools.preCommit, ["--version"]);
  expect(preCommit.stdout.trim()).toBe("pre-commit 4.4.0");
});
