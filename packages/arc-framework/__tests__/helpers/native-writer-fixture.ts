/** Native cache/report writers with observable asynchronous controller closing. */
import { execa } from "execa";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CALL_LIMIT } from "./call-limit.js";
import { copyLiveDependencies } from "./copy-live-dependencies.js";
import { makeVitestRuntimeFixture } from "./vitest-runtime-fixture.js";

/** Compose real runtime setup with private native caches and a closing gate. */
export async function makeNativeWriterFixture() {
  const fixture = await makeVitestRuntimeFixture();
  await writeFile(fixture.events, "");
  await copyLiveDependencies(resolve(import.meta.dirname, "../.."), fixture.packageRoot, [
    "__tests__/helpers/native-writer-input.ts", "__tests__/helpers/heavy-first-sequencer.ts",
  ]);
  // The compiler fixture shares dependencies; mutable Vite output gets its own ancestor.
  await rm(join(fixture.packageRoot, "node_modules"));
  await mkdir(join(fixture.packageRoot, "node_modules"));
  const configPath = join(fixture.packageRoot, "vitest.config.mjs");
  const config = 'import { readNativeWriterInput } from "./__tests__/helpers/native-writer-input.ts";\n'
    + await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace('import { appendFileSync }', 'import { appendFileSync, existsSync }')
    .replace('closeBundle() { appendFileSync(events, "closed\\n"); }', `async closeBundle() {
      appendFileSync(events, JSON.stringify({ stage: "closing", writer: process.env.NATIVE_WRITER_ID, handed: readNativeWriterInput(),
        owned: existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))}) }) + "\\n");
      while (process.env.NATIVE_WRITER_GATE && !existsSync(process.env.NATIVE_WRITER_GATE)) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      appendFileSync(events, JSON.stringify({ stage: "closing-release", writer: process.env.NATIVE_WRITER_ID,
        handed: readNativeWriterInput(), owned: existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))}) }) + "\\n");
      appendFileSync(events, JSON.stringify({ stage: "closed", writer: process.env.NATIVE_WRITER_ID }) + "\\n");
    }`)
    .replace('reporters: ["default", "./tests/reporter.mjs"],',
      'reporters: ["default", "json"], outputFile: "native-report.json",'));
  for (const tier of ["integration", "e2e"]) {
    const setup = join(fixture.packageRoot, "tests", `${tier}-setup.mjs`);
    await writeFile(setup, 'import { readNativeWriterInput } from "../__tests__/helpers/native-writer-input.ts";\n'
      + (await readFile(setup, "utf8")).replace('generation: evidence.generation, owned:',
        'writer: process.env.NATIVE_WRITER_ID, handed: readNativeWriterInput(), generation: evidence.generation, owned:')
        .replace('return () => observe("teardown");', `return () => {
          observe("teardown");
          if (process.env.NATIVE_WRITER_CLOSE_FAILURE === "1") throw new Error("native closing failure retained");
        };`));
  }
  return { ...fixture, report: join(fixture.packageRoot, "native-report.json") };
}

/** Launch a tiny real integration controller, leaving only the artifact lease under contention. */
export function startNativeWriter(packageRoot: string, writer: string, gate?: string, filter?: string, environment: NodeJS.ProcessEnv = {}) {
  const child = execa(process.execPath, ["--import", "tsx", join(packageRoot, "src/scripts/run-local-test-tier.ts"),
    "integration", ...(filter === undefined ? [] : [filter])], {
    cwd: packageRoot, reject: false, timeout: CALL_LIMIT,
    // The outer integration run owns pool admission; these tiny controllers exercise checkout exclusion.
    env: { CI: "1", FORCE_COLOR: undefined, ARC_E2E_SKIP_BUILD: undefined, VITEST_MAX_WORKERS: undefined,
      ARC_TEST_DURATION_FILE: undefined, ...environment, NATIVE_WRITER_ID: writer, NATIVE_WRITER_GATE: gate },
  });
  let diagnostics = "";
  child.stderr?.on("data", (data: Buffer) => { diagnostics += data.toString(); });
  return { child, diagnostics: () => diagnostics };
}

/** Wait for a semantic process event, preserving a bounded diagnostic on failure. */
export async function waitForNativeWriter(predicate: () => Promise<boolean> | boolean, description: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Read only structured lifecycle observations emitted by the native fixture. */
export async function nativeWriterEvents(path: string): Promise<{ stage: string; writer: string; owned?: boolean; handed?: { file: string; contents: string } }[]> {
  return (await readFile(path, "utf8")).split("\n").filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as { stage: string; writer: string; owned?: boolean; handed?: { file: string; contents: string } });
}
