/** Disposable configured projects exercised by the supported Node controller entry. */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { makeNativeBuildFixture } from "./native-build-fixture.js";

const execute = promisify(execFile);

/**
 * Create two named native projects with an observable controller closing hook.
 * @param preParse - Native parsing switch
 * @returns Caller-owned disposable checkout paths
 */
export async function makeVitestControllerFixture(preParse = false): Promise<{
  root: string; packageRoot: string; events: string;
}> {
  const fixture = await makeNativeBuildFixture();
  const events = join(fixture.packageRoot, "events.log");
  await mkdir(join(fixture.packageRoot, "tests"));
  await writeFile(join(fixture.packageRoot, "vitest.config.mjs"), `
import { appendFileSync } from "node:fs";
const events = ${JSON.stringify(events)};
appendFileSync(events, "config:" + [process.env.TEST, process.env.VITEST, process.env.NODE_ENV].join(":") + "\\n");
export default {
  plugins: [{ name: "closing-observer", closeBundle() { appendFileSync(events, "closed\\n"); } }],
  test: { watch: false, maxWorkers: 1, reporters: ["default", "./tests/reporter.mjs"],
    experimental: { preParse: ${String(preParse)} },
    projects: [
      { test: { name: "unit", root: import.meta.dirname, include: ["tests/unit*.test.mjs"],
        globalSetup: ["tests/unit-setup.mjs"] } },
      { test: { name: "integration", root: import.meta.dirname, include: ["tests/integration*.test.mjs"],
        globalSetup: ["tests/integration-setup.mjs"] } }
    ]
  }
};
`);
  await writeFile(join(fixture.packageRoot, "tests/integration-setup.mjs"), `
import { appendFileSync } from "node:fs";
export function setup() { appendFileSync(${JSON.stringify(events)}, "integration-setup\\n"); }
`);
  await writeFile(join(fixture.packageRoot, "tests/unit-setup.mjs"), `
import { appendFileSync } from "node:fs";
export function setup() { appendFileSync(${JSON.stringify(events)}, "unit-setup:" +
  [process.env.TEST, process.env.VITEST, process.env.NODE_ENV].join(":") + "\\n"); }
`);
  await writeFile(join(fixture.packageRoot, "tests/reporter.mjs"), `
import { appendFileSync } from "node:fs";
export default class { onInit() { appendFileSync(${JSON.stringify(events)}, "initialized\\n"); } }
`);
  return { ...fixture, events };
}

/**
 * Run the supported adapter in its own controller process, retaining native diagnostics.
 * @param packageRoot - Disposable package cwd
 * @param args - Tier followed by native filters/options
 * @param environment - Explicit process environment changes
 * @param entry - Supported adapter or native CLI comparison
 * @returns Exit status and complete process output
 */
export async function runVitestControllerFixture(
  packageRoot: string, args: string[], environment: NodeJS.ProcessEnv = {},
  entry: "supported" | "native" = "supported",
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env = Object.fromEntries(Object.entries({ ...process.env, ...environment })
    .filter(([, value]) => value !== undefined));
  try {
    const script = entry === "native" ? join(packageRoot, "../../node_modules/vitest/vitest.mjs")
      : join(packageRoot, "src/scripts/run-local-test-tier.ts");
    const { stdout, stderr } = await execute(process.execPath,
      ["--import", "tsx", script, ...args],
      { cwd: packageRoot, env, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof result.code === "number" ? result.code : 1,
      stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }
}
