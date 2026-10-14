/** Declared command execution through the built check CLI. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("passes file paths containing spaces and shell metacharacters verbatim", async () => {
  const path = "src/space ;$(printf expansion).ts";
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "capture.cjs"], mode: "files", inputs: [path],
  } });
  repositories.push(root);
  await writeFile(join(root, path), "literal\n");
  const result = await runArc(["check", "run", "files", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toEqual({ cwd: root, args: [path] });
});

it("runs a declared shell string through the platform shell", async () => {
  const root = await createDeclaredCheckRepository({ shell: {
    command: "echo shell-ran > receipt.json", shell: true, inputs: ["src/**"],
  } });
  repositories.push(root);
  const result = await runArc(["check", "run", "shell", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  expect((await readFile(join(root, "receipt.json"), "utf8")).trim()).toBe("shell-ran");
});

it("runs below the repository root and passes paths relative to that working directory", async () => {
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "../capture.cjs"], root: "docs", mode: "files", inputs: ["src/a.ts"],
  } });
  repositories.push(root);
  const result = await runArc(["check", "run", "files", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  expect(JSON.parse(await readFile(join(root, "docs/receipt.json"), "utf8"))).toEqual({
    cwd: join(root, "docs"), args: ["../src/a.ts"],
  });
});

it("reports a command that never starts as couldn't run and succeeds after its declaration is repaired", async () => {
  const root = await createDeclaredCheckRepository({ missing: { command: ["arc-check-program-does-not-exist"], inputs: ["src/**"] } });
  repositories.push(root);
  for (let repeat = 0; repeat < 2; repeat++) {
    const result = await runArc(["check", "run", "missing", "--json"], root);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "missing", outcome: "couldn't run" }]);
  }
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: {
    missing: { command: [process.execPath, "-e", "console.log('repaired')"], inputs: ["src/**"] },
  } }));
  const repaired = await runArc(["check", "run", "missing", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
});

it("reports a command killed before it finishes as couldn't run and passes once it can finish", async () => {
  const killed = {
    // A runner relays a remote kill as the shell's exit status for SIGKILL.
    relayed: { command: [process.execPath, "-e", "process.exit(137)"], inputs: ["src/**"] },
    ...(process.platform === "win32" ? {} : {
      signalled: { command: [process.execPath, "-e", "process.kill(process.pid, 'SIGKILL')"], inputs: ["src/**"] },
    }),
  };
  const root = await createDeclaredCheckRepository(killed);
  repositories.push(root);
  const ids = Object.keys(killed);
  const result = await runArc(["check", "run", ...ids, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(2);
  expect(JSON.parse(result.stdout).result.checks).toEqual(expect.arrayContaining(ids.map(id => expect.objectContaining({
    id, outcome: "couldn't run", reason: expect.stringContaining("killed before it finished"),
    remedy: expect.stringContaining(`arc check run ${id}`),
  }))));
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: Object.fromEntries(ids.map(id =>
    [id, { command: [process.execPath, "-e", "console.log('finished')"], inputs: ["src/**"] }])) }));
  const finished = await runArc(["check", "run", ...ids, "--json"], root);
  expect(finished.exitCode, finished.stderr).toBe(0);
  expect(JSON.parse(finished.stdout).result.checks).toEqual(ids.map(() => expect.objectContaining({ outcome: "passed" })));
});

it("reports a missing program inside a started shell as failed", async () => {
  const root = await createDeclaredCheckRepository({ shell: {
    command: "arc-shell-program-does-not-exist", shell: true, inputs: ["src/**"],
  } });
  repositories.push(root);
  const result = await runArc(["check", "run", "shell", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "shell", outcome: "failed" }]);
});
