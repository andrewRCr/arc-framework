import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const PROCESS_TIMEOUT_MS = 15_000;
const REPOSITORY_SCAN_TIMEOUT_MS = 30_000;

let temporaryRoot: string | undefined;

async function createListenProbe(): Promise<{ marker: string; nodeOptions: string }> {
  temporaryRoot = await mkdtemp(join(tmpdir(), "arc-one-shot-entrypoint-"));
  const marker = join(temporaryRoot, "armed.log");
  const probe = join(temporaryRoot, "reject-listen.mjs");
  await writeFile(
    probe,
    [
      'import { appendFileSync } from "node:fs";',
      'import { Server } from "node:net";',
      'appendFileSync(process.env.ARC_LISTEN_PROBE, `armed:${process.pid}\\n`);',
      'Server.prototype.listen = function rejectListen() {',
      '  throw new Error("auxiliary IPC listener attempted");',
      '};',
      "",
    ].join("\n"),
    "utf8",
  );
  // A file URL rather than a path: NODE_OPTIONS is split on whitespace, so a temporary
  // directory containing a space would break the option into two arguments.
  return { marker, nodeOptions: `--import=${pathToFileURL(probe).href}` };
}

afterEach(async () => {
  if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("one-shot TypeScript package scripts", () => {
  it("routes every bounded TypeScript script through the in-process loader", async () => {
    const rootManifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const packageManifest = JSON.parse(
      await readFile(join(repositoryRoot, "packages/arc-framework/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(rootManifest.scripts).toMatchObject({
      "lint:md": "node --import tsx packages/arc-framework/src/scripts/lint-markdown.ts",
      "lint:md:staged": "node --import tsx packages/arc-framework/src/scripts/lint-markdown-staged.ts",
      "lint:md:markdownlint": "npm run -s lint:md:dependencies && node --import tsx packages/arc-framework/src/scripts/lint-markdown-worktree.ts",
      "lint:md:descriptors": "node --import tsx packages/arc-framework/src/scripts/lint-task-descriptors.ts",
      "lint:md:dependencies": "node --import tsx packages/arc-framework/src/scripts/verify-markdown-dependencies.ts",
      "format:tables": "node --import tsx packages/arc-framework/src/scripts/format-tables.ts",
      "render:framework": "node --import tsx packages/arc-framework/src/scripts/render-framework.ts",
      "audit:tables": "node --import tsx packages/arc-framework/src/scripts/audit-tables.ts",
      "audit:emphasis": "node --import tsx packages/arc-framework/src/scripts/audit-emphasis.ts",
      "inventory:command-inputs": "node --import tsx packages/arc-framework/src/scripts/render-command-input-inventory.ts",
      "lint:arc:triggers": "node --import tsx packages/arc-framework/src/scripts/audit-method-triggers.ts",
      "lint:arc:domain-rules": "node --import tsx packages/arc-framework/src/scripts/audit-domain-rules.ts",
      "lint:arc:section-refs": "node --import tsx packages/arc-framework/src/scripts/audit-section-refs.ts",
      "audit:coupling": "node --import tsx packages/arc-framework/src/scripts/audit-coupling-blast-radius.ts",
    });
    expect(packageManifest.scripts).toMatchObject({
      "benchmark:session-envelope": "npm run build && node --import tsx __tests__/benchmarks/session-envelope-validation.ts",
      "benchmark:test-cost": "node --import tsx src/scripts/measure-test-cost.ts",
      "benchmark:test-cost:compare": "node --import tsx src/scripts/compare-test-cost.ts",
      "benchmark:test-cost:normalize": "node --import tsx src/scripts/normalize-test-cost.ts",
      "benchmark:test-cost:shards": "node --import tsx src/scripts/measure-e2e-shards.ts",
      "inventory:command-inputs": "node --import tsx src/scripts/render-command-input-inventory.ts",
    });
  });

  it("forwards output arguments without opening an auxiliary listener", async () => {
    const { marker, nodeOptions } = await createListenProbe();
    const output = join(temporaryRoot!, "command-input-inventory.md");

    const result = await execute(
      npmExecutable,
      ["run", "-s", "inventory:command-inputs", "-w", "packages/arc-framework", "--", "--output", output],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, FORCE_COLOR: undefined, ARC_LISTEN_PROBE: marker, NODE_OPTIONS: nodeOptions },
      },
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(await readFile(output, "utf8")).toMatch(/^identity\torigin\tacquisition\tschema\t/u);
    expect(await readFile(marker, "utf8")).toMatch(/^armed:\d+\n(?:armed:\d+\n)*$/u);
  }, REPOSITORY_SCAN_TIMEOUT_MS);

  it("preserves failure output and exit status without opening an auxiliary listener", async () => {
    const { marker, nodeOptions } = await createListenProbe();

    await expect(execute(
      npmExecutable,
      ["run", "-s", "inventory:command-inputs", "-w", "packages/arc-framework", "--", "--output"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, FORCE_COLOR: undefined, ARC_LISTEN_PROBE: marker, NODE_OPTIONS: nodeOptions },
      },
    )).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: expect.stringContaining("--output requires a path"),
    });
    expect(await readFile(marker, "utf8")).toMatch(/^armed:\d+\n(?:armed:\d+\n)*$/u);
  }, PROCESS_TIMEOUT_MS);

  it("shows framework renderer usage before validating help as a Markdown path", async () => {
    const result = await execute(npmExecutable, ["run", "-s", "render:framework", "--", "--help"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: undefined },
    });

    expect(result.stdout).toContain("Usage: npm run render:framework -- <package-source.md>");
    expect(result.stdout).toContain("packages/arc-framework/arc/");
    expect(result.stderr).toBe("");
  }, PROCESS_TIMEOUT_MS);
});
