/** Incomplete content reads never produce a reusable key. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { resolveCheckKey, type CheckKeyIO } from "../../../../src/lib/checks/key-resolver.js";
import { scriptGitExec, scriptGitExecInput } from "../../../helpers/git-exec-fake.js";

const checked = "a".repeat(40);
const base = "b".repeat(40);
const parent = "c".repeat(40);
const empty = "d".repeat(40);
const definition = CheckDeclarationSchema.parse({ global_inputs: ["docs/b.md"], checks: {
  files: { command: ["check"], mode: "files", inputs: ["src/a.ts"] },
} });
const context = { id: "files", check: definition.checks.files!, definition, root: "/repository", tree: checked,
  paths: ["src/a.ts"], base, merged: [parent] };

function boundary(fault?: string): CheckKeyIO {
  return {
    gitInput: scriptGitExecInput([{ match: ["mktree"], responses: [empty] }]).exec,
    git: scriptGitExec([{ match: { prefix: ["diff"] }, responses: [({ args }) => {
      const coordinate = args[6];
      const global = args.includes(":(glob)docs/b.md");
      const locus = coordinate === checked ? global ? "global" : "own" : coordinate === base ? "base" : "parent";
      if (locus === fault) return { failure: { exitCode: 128, stderr: "object unavailable" } };
      if (fault === "malformed") return { stdout: "invalid raw diff", stderr: "" };
      if (fault === `absent-${locus}`) return { stdout: "", stderr: "" };
      const path = global ? "docs/b.md" : "src/a.ts";
      return { stdout: `:000000 100644 ${"0".repeat(40)} ${"e".repeat(40)} A\0${path}\0`, stderr: "" };
    }] }]).exec,
    runtime: async () => ({ exitCode: 0, stdout: "" }),
  };
}

it("builds a stable key after all tree content is available", async () => {
  const first = await resolveCheckKey(boundary(), context);
  expect(first).toMatch(/^[0-9a-f]{64}$/u);
  expect(await resolveCheckKey(boundary(), context)).toBe(first);
});

it.each(["own", "global", "base", "parent", "malformed"])("leaves a %s read failure incomplete", async fault => {
  await expect(resolveCheckKey(boundary(fault), context)).resolves.toBeNull();
});

it.each(["base", "parent"])("distinguishes absent received paths at the %s from existing content", async locus => {
  const existing = await resolveCheckKey(boundary(), context);
  const absent = await resolveCheckKey(boundary(`absent-${locus}`), context);
  expect(absent).toMatch(/^[0-9a-f]{64}$/u);
  expect(absent).not.toBe(existing);
});


it.each([base, parent])("hashes unreceived own and global input content at %s", async coordinate => {
  const declared = CheckDeclarationSchema.parse({ global_inputs: ["docs/b.md"], checks: {
    files: { command: ["check"], mode: "files", inputs: ["src/**"] },
  } });
  const keyContext = { ...context, definition: declared, check: declared.checks.files! };
  const key = async (counterpart: string, global: string) => {
    const io = boundary();
    const original = io.git;
    io.git = async (command, args, options) => {
      const result = await original(command, args, options);
      if (args[6] !== coordinate) return result;
      const path = args.includes(":(glob)docs/b.md") ? "docs/b.md" : "src/counterpart.ts";
      const blob = path === "docs/b.md" ? global : counterpart;
      return { stdout: result.stdout.replaceAll("e".repeat(40), path === "docs/b.md" ? blob.repeat(40) : "e".repeat(40))
        + (path === "docs/b.md" ? "" : `:000000 100644 ${"0".repeat(40)} ${blob.repeat(40)} A\0${path}\0`) };
    };
    return resolveCheckKey(io, keyContext);
  };
  const initial = await key("f", "e");
  expect(await key("a", "e")).not.toBe(initial);
  expect(await key("f", "b")).not.toBe(initial);
  expect(await key("f", "e")).toBe(initial);
});
