/** Native checks freeze explicit input bindings before runtime qualification and execution. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("shares frozen file/value inputs through global/check probes and native command execution", async () => {
  const read = "const fs=require('node:fs');const value=fs.readFileSync(process.env.CHECK_WEIGHTS,'utf8');";
  const globalProbe = [process.execPath, "-e", read + "fs.writeFileSync('tools/weights','changed by global probe');process.stdout.write(value+process.env.CHECK_MODE)"];
  const checkProbe = [process.execPath, "-e", read + "fs.writeFileSync('weights','changed by check probe');process.stdout.write(value+process.env.CHECK_MODE)"];
  const program = read + "fs.writeFileSync('receipt.json',JSON.stringify({value,mode:process.env.CHECK_MODE,binding:process.env.CHECK_WEIGHTS}));console.log('checked')";
  const root = await createDeclaredCheckRepository({ frozen: { command: [process.execPath, "-e", program], root: "tools",
    inputs: ["src/**"], runtime_inputs: [checkProbe], environment_inputs: { CHECK_MODE: "value", CHECK_WEIGHTS: "file" } } },
  { global_runtime_inputs: [globalProbe] });
  repositories.push(root);
  await mkdir(join(root, "tools"));
  await writeFile(join(root, "tools/weights"), "initial-secret-file-bytes");
  const result = await runArc(["check", "run", "frozen", "--json"], root,
    { env: { CHECK_MODE: "private-scalar-marker", CHECK_WEIGHTS: "weights" } });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed", output: "checked", record: { status: "recorded" } }]);
  const observed: { value: string; mode: string; binding: string } = JSON.parse(await readFile(join(root, "tools/receipt.json"), "utf8"));
  expect(observed).toMatchObject({ value: "initial-secret-file-bytes", mode: "private-scalar-marker" });
  await expect(readFile(observed.binding)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(root, "tools/weights"), "utf8")).not.toBe("initial-secret-file-bytes");
  for (const sensitive of [observed.binding, "private-scalar-marker", "initial-secret-file-bytes", join(root, "tools/weights")]) {
    expect(result.stdout).not.toContain(sensitive);
  }
});

it("reuses scoped passes by explicit presence and bytes rather than input file locations or unrelated sources", async () => {
  const program = "const fs=require('node:fs');const file=process.env.CHECK_WEIGHTS;const value=file===undefined?'unset':file===''?'empty':fs.readFileSync(file,'utf8');fs.writeFileSync('receipt.json',JSON.stringify({value,mode:process.env.CHECK_MODE??null}));console.log('checked')";
  const root = await createDeclaredCheckRepository({ frozen: { command: [process.execPath, "-e", program], inputs: ["src/**"],
    environment_inputs: { CHECK_MODE: "value", CHECK_WEIGHTS: "file" } } });
  repositories.push(root);
  await writeFile(join(root, "first"), "same");
  await writeFile(join(root, "second"), "same");
  await writeFile(join(root, "zero"), "");
  const run = async (file: string | undefined, mode: string | undefined, outcome: string, value: string) => {
    const result = await runArc(["check", "run", "frozen", "--json"], root, { env: { CHECK_MODE: mode, CHECK_WEIGHTS: file } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome }]);
    if (outcome === "passed") expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toEqual({ value, mode: mode ?? null });
  };
  await run("first", "one", "passed", "same");
  await run("first", "one", "reused", "same");
  await run("second", "one", "reused", "same");
  await writeFile(join(root, "second"), "diff");
  await run("second", "one", "passed", "diff");
  await run("second", "two", "passed", "diff");
  await run("second", undefined, "passed", "diff");
  await run("second", "", "passed", "diff");
  await run("", "", "passed", "empty");
  await run(undefined, "", "passed", "unset");
  await run("zero", "", "passed", "");
  await writeFile(join(root, "unrelated.txt"), "unrelated source movement");
  await run("first", "one", "reused", "same");
});
