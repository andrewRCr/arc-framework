/** Incomplete content reads never produce a reusable key. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { resolveCheckKey, resolveCheckKeyMaterial, type CheckKeyIO } from "../../../../src/lib/checks/key-resolver.js";
import { checkContentKey } from "../../../../src/lib/checks/key.js";
import { indexSourcePresentation } from "../../../../src/lib/checks/runner/source-scope.js";
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

it("resolves current and historical material without observing declared runtime probes", async () => {
  const declared = CheckDeclarationSchema.parse({ ...definition, global_runtime_inputs: [["global-runtime"]],
    checks: { files: { ...context.check, runtime_inputs: [["check-runtime"]] } } });
  const selected = { ...context, definition: declared, check: declared.checks.files! };
  const forbidden = { ...boundary(), runtime: async (): Promise<never> => { throw new Error("Caller runtime is unavailable"); } };
  const material = await resolveCheckKeyMaterial(forbidden, selected);
  expect(material).not.toBeNull();
  expect(material?.inputs.map(entry => entry.path)).toEqual(["src/a.ts"]);
  expect(material?.globalInputs?.map(entry => entry.path)).toEqual(["docs/b.md"]);
  expect(material?.base?.map(entry => entry.path)).toEqual(["docs/b.md", "src/a.ts"]);
  expect(material?.merged?.[0]?.map(entry => entry.path)).toEqual(["docs/b.md", "src/a.ts"]);
  if (material === null) throw new Error("Expected complete probe-free material");
  const io = { ...boundary(), runtime: async (command: readonly string[]) => ({ exitCode: 0,
    stdout: command[0] === "global-runtime" ? " global\r\n" : " check\n" }) };
  expect(checkContentKey({ ...material, globalRuntime: [" global\r\n"], runtime: [" check\n"] }))
    .toBe(await resolveCheckKey(io, selected));
});

it("reads scoped raw presentation through captured Git after the live root is unavailable", async () => {
  const entries = ["docs/b.md", "src/a.ts", "unrelated.txt"].map(path => ({ path, kind: "file" as const,
    mode: 0o644, bytes: 3, digest: `sha256:${"f".repeat(64)}` as const }));
  const index = indexSourcePresentation({ manifest: { version: 1, coordinates: { tree: checked, merged: [] }, entries },
    codePaths: new Map(entries.map(entry => [entry.path, entry.path])) });
  const io = boundary();
  const material = await resolveCheckKeyMaterial({ ...io, capturedSource: { root: "/captured", index },
    git: async (command, args, options) => {
      if (options?.cwd !== "/captured") throw new Error("Original caller checkout is unavailable");
      return io.git(command, args, options);
    } }, context);
  expect(material).not.toBeNull();
  expect(material?.materializedInputs).toEqual(entries.slice(0, 2).map(entry => ({ path: entry.path, entry })));
});

it("leaves matched but unmapped raw content incomplete instead of falling back to canonical blobs", async () => {
  const index = indexSourcePresentation({ manifest: { version: 1, coordinates: { tree: checked, merged: [] }, entries: [] },
    codePaths: new Map() });
  expect(await resolveCheckKeyMaterial({ ...boundary(), capturedSource: { root: "/captured", index } }, context)).toBeNull();
});

it("keeps native probes before historical reads that those probes make available", async () => {
  const declared = CheckDeclarationSchema.parse({ ...definition, global_runtime_inputs: [["prepare-history"]] });
  let available = false;
  const original = boundary();
  const io: CheckKeyIO = { ...original, runtime: async () => {
    available = true;
    return { exitCode: 0, stdout: "history is available\n" };
  }, git: async (command, args, options) => {
    if (args[6] === base && !available) throw new Error("Historical objects are unavailable before native preparation");
    return original.git(command, args, options);
  } };
  expect(await resolveCheckKey(io, { ...context, definition: declared, check: declared.checks.files! })).toMatch(/^[0-9a-f]{64}$/u);
});

it("builds a stable key after all tree content is available", async () => {
  const first = await resolveCheckKey(boundary(), context);
  expect(first).toMatch(/^[0-9a-f]{64}$/u);
  expect(await resolveCheckKey(boundary(), context)).toBe(first);
});

it("preserves captured environment identity through scoped key resolution", async () => {
  const first = await resolveCheckKey(boundary(), { ...context, environmentIdentity: `sha256:${"a".repeat(64)}` });
  const changed = await resolveCheckKey(boundary(), { ...context, environmentIdentity: `sha256:${"b".repeat(64)}` });
  expect(first).toMatch(/^[a-f0-9]{64}$/u);
  expect(changed).not.toBe(first);
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
