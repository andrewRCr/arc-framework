/** Existing generated entries acquire the current native dispatch fields. */
import { expect, it } from "vitest";
import yaml from "js-yaml";
import { upgradeGeneratedHooks, ARC_GIT_HOOKS_DIR } from "../../src/lib/hook-integration.js";

it("upgrades a generated Lefthook push entry and preserves unrelated commands", async () => {
  const path = "/repo/lefthook.yml";
  const input = yaml.dump({ "pre-push": { commands: {
    "arc-pre-push": { run: `${ARC_GIT_HOOKS_DIR}/pre-push {1} {2}` },
    lint: { run: "npm run lint" },
  } } });
  const files = new Map<string, string>();
  const result = await upgradeGeneratedHooks({ manager: "lefthook", configPath: path }, async () => input,
    async (target, content) => { files.set(target, content); });
  const generated = yaml.load(files.get(path) ?? "") as unknown;
  expect(generated).toMatchObject({ "pre-push": { commands: {
    "arc-pre-push": { run: `${ARC_GIT_HOOKS_DIR}/pre-push {1} {2}`, use_stdin: true },
    lint: { run: "npm run lint" },
  } } });
  expect(result).toEqual({ files: [path], warnings: [], instructions: [] });
});

it("upgrades generated pre-commit entries and preserves existing install types", async () => {
  const path = "/repo/.pre-commit-config.yaml";
  const arc = (id: string, event: string, files: string) => ({ id, name: id, entry: `${ARC_GIT_HOOKS_DIR}/${event}`,
    language: "unsupported_script", stages: [event === "pre-commit" ? "commit" : event], files });
  const input = { default_install_hook_types: ["pre-commit", "post-commit"], repos: [
    { repo: "remote-hooks", rev: "v1", hooks: [{ id: "arc-pre-push" }] },
    { repo: "local", hooks: [arc("arc-pre-commit", "pre-commit", "."), arc("arc-commit-msg", "commit-msg", "^$"),
      arc("arc-pre-push", "pre-push", "^$"), { id: "custom", entry: "custom-command" }] },
  ] };
  const files = new Map<string, string>();
  const result = await upgradeGeneratedHooks({ manager: "pre-commit", configPath: path }, async () => yaml.dump(input),
    async (target, content) => { files.set(target, content); });
  const output = yaml.load(files.get(path) ?? "") as typeof input;
  expect(output?.repos[0]).toEqual(input.repos[0]);
  const hooks = output?.repos[1]?.hooks;
  expect(hooks?.find(hook => hook.id === "arc-pre-commit"))
    .toMatchObject({ pass_filenames: false, require_serial: true, always_run: true });
  expect(hooks?.find(hook => hook.id === "arc-commit-msg")).not.toHaveProperty("files");
  expect(hooks?.find(hook => hook.id === "arc-pre-push")).toMatchObject({ always_run: true });
  expect(hooks?.find(hook => hook.id === "custom")).toEqual({ id: "custom", entry: "custom-command" });
  expect(output?.default_install_hook_types).toEqual(["pre-commit", "post-commit", "commit-msg", "pre-push"]);
  expect(result.files).toEqual([path]);
  expect(result.instructions).toEqual(["Run pre-commit install to activate the configured Git hook types."]);
});

it.each([
  { manager: "lefthook" as const, config: { "pre-push": { commands: {
    "arc-pre-push": { run: `${ARC_GIT_HOOKS_DIR}/pre-push {1} {2}` },
  } } } },
  { manager: "pre-commit" as const, config: { repos: [{ repo: "local", hooks: [
    { id: "arc-pre-push", entry: `${ARC_GIT_HOOKS_DIR}/pre-push` },
  ] }] } },
])("leaves a current $manager configuration byte-identical", async ({ manager, config }) => {
  const detection = { manager, configPath: "/repo/hooks.yml" };
  let content = yaml.dump(config);
  const read = async () => content;
  const write = async (_path: string, updated: string) => { content = updated; };
  await upgradeGeneratedHooks(detection, read, write);
  content = `# Personal configuration note\n${content}`;
  const before = content;
  const result = await upgradeGeneratedHooks(detection, read, write);
  expect(content).toBe(before);
  expect(result).toEqual({ files: [], warnings: [], instructions: [] });
});

it.each([
  { manager: "lefthook" as const, id: "arc-pre-push", config: { "pre-push": { commands: {
    "arc-pre-push": { run: "custom-push-command", env: { PERSON_SETTING: "kept" } },
  } } } },
  { manager: "pre-commit" as const, id: "arc-pre-push", config: { repos: [{ repo: "local", hooks: [
    { id: "arc-pre-push", entry: "custom-push-command", args: ["--personal"] },
  ] }] } },
  { manager: "pre-commit" as const, id: "arc-commit-msg", config: { repos: [{ repo: "local", hooks: [
    { id: "arc-commit-msg", entry: `${ARC_GIT_HOOKS_DIR}/commit-msg`, files: "PERSONAL_FILTER" },
  ] }] } },
])("preserves and reports a customized $manager $id entry", async ({ manager, id, config }) => {
  const path = "/repo/hooks.yml";
  let content = `# Personal configuration\n${yaml.dump(config)}`;
  const before = content;
  const result = await upgradeGeneratedHooks({ manager, configPath: path }, async () => content,
    async (_path, updated) => { content = updated; });
  expect(content).toBe(before);
  expect(result.files).toEqual([]);
  expect(result.instructions).toEqual([]);
  expect(result.warnings).toEqual([expect.stringContaining(`${path}: ${id}`)]);
  expect(result.warnings[0]).toContain("left unchanged");
});

it.each([
  { manager: "lefthook" as const, input: "pre-push: [" },
  { manager: "pre-commit" as const, input: "repos: [" },
  { manager: "lefthook" as const, input: "not-a-configuration\n" },
  { manager: "pre-commit" as const, input: "not-a-configuration\n" },
])("reports unreadable $manager configuration without rewriting it: $input", async ({ manager, input }) => {
  const path = "/repo/hooks.yml";
  let content = input;
  const promise = upgradeGeneratedHooks({ manager, configPath: path }, async () => content,
    async (_path, updated) => { content = updated; });
  await expect(promise).resolves.toMatchObject({ files: [], instructions: [], warnings: [expect.stringContaining(path)] });
  expect(content).toBe(input);
  expect((await promise).warnings[0]).toContain("repair");
});
