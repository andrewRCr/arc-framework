/** Real owning process and surviving compiler barriers for artifact lifetime verification. */
import { execFile, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeNativeBuildFixture } from "./native-build-fixture.js";

/** Barrier paths and the real controller process created by this fixture. */
export interface NativeBuildController {
  readonly root: string;
  readonly packageRoot: string;
  readonly readyPath: string;
  readonly releasePath: string;
  readonly owner: ChildProcess;
  readonly done: Promise<void>;
  readonly cleanupCompiler: () => Promise<void>;
}

/**
 * Block the fixture-owned compiler success hook while its owning process maintains artifact renewal.
 * @param surviveOwnerDeath - Arrange a surviving Windows compiler outside its owner's process job
 * @returns Caller-owned fixture, compiler barrier paths, and owning process completion
 */
export async function startBlockedBuildController(surviveOwnerDeath = false): Promise<NativeBuildController> {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const readyPath = join(packageRoot, ".compiler-ready");
  const releasePath = join(packageRoot, ".release-compiler");
  const hookPath = join(packageRoot, "src/fixture-build-hook.ts");
  await writeFile(hookPath, `
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
export async function runBuildHook(outDir: string, packageRoot: string): Promise<void> {
  void packageRoot;
  await writeFile(${JSON.stringify(readyPath)}, JSON.stringify({ pid: process.pid, directory: outDir }));
  while (!existsSync(${JSON.stringify(releasePath)})) await new Promise((resolve) => setTimeout(resolve, 10));
}
`);
  if (process.platform === "win32") {
    const diagnosticPath = join(packageRoot, ".compiler-diagnostics");
    const compilerPath = join(packageRoot, "src/scripts/build-compiler.ts");
    const compiler = await readFile(compilerPath, "utf8");
    await writeFile(compilerPath, `import { appendFileSync as appendCompilerDiagnostic } from "node:fs";
const diagnosticFile = ${JSON.stringify(diagnosticPath)};
function recordCompilerDiagnostic(file: string, message: string): void {
  try { appendCompilerDiagnostic(file, message); } catch { /* Cleanup may have removed the fixture. */ }
}
process.on("exit", (code) => recordCompilerDiagnostic(diagnosticFile, JSON.stringify({ event: "exit", pid: process.pid, code }) + "\\n"));
process.on("uncaughtExceptionMonitor", (error) => recordCompilerDiagnostic(diagnosticFile,
  JSON.stringify({ event: "uncaught", pid: process.pid, message: error.message, stack: error.stack }) + "\\n"));
` + compiler.replace("    console.error(error);", `    recordCompilerDiagnostic(diagnosticFile,
      JSON.stringify({ event: "bootstrap-error", pid: process.pid, error: String(error) }) + "\\n");
    console.error(error);`));
    const blockedHook = await readFile(hookPath, "utf8");
    await writeFile(hookPath, 'import { appendFileSync as recordHookDiagnostic } from "node:fs";\n'
      + blockedHook.replace('  while (!existsSync', `  recordHookDiagnostic(${JSON.stringify(diagnosticPath)}, "hook-ready\\n");
  while (!existsSync`).replace('setTimeout(resolve, 10));', `setTimeout(resolve, 10));
  recordHookDiagnostic(${JSON.stringify(diagnosticPath)}, "release-observed\\n");
  recordHookDiagnostic(${JSON.stringify(diagnosticPath)}, "hook-finished\\n");`));
  }
  if (process.platform === "win32" && surviveOwnerDeath) {
    const entryPath = join(packageRoot, "src/lib/build-entry.ts");
    const entry = await readFile(entryPath, "utf8");
    const boundary = /^async function runNodeBuildTool\([\s\S]*?^}/m;
    if (!boundary.test(entry)) throw new Error("Native compiler launch boundary is missing");
    await writeFile(entryPath, `import { spawn as spawnFixtureCompiler } from "node:child_process";
import { openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
` + entry.replace(boundary, `
async function runNodeBuildTool(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  const logPath = join(cwd, ".compiler-output");
  const output = openSync(logPath, "a");
  let child: ReturnType<typeof spawnFixtureCompiler>;
  try {
    child = spawnFixtureCompiler(process.execPath, args, {
      cwd, env, detached: true, stdio: ["ignore", output, output], windowsHide: true,
    });
    if (child.pid !== undefined) writeFileSync(join(cwd, ".compiler-pid"), String(child.pid));
  } finally { closeSync(output); }
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        let diagnostic = "Compiler output unavailable";
        try { diagnostic = readFileSync(logPath, "utf8"); } catch { /* Retain the exit status. */ }
        reject(new Error("Compiler exit " + code + "/" + signal + ": " + diagnostic));
      }
    });
  });
}
`));
  }
  const script = join(packageRoot, "src/scripts/fixture-owner.ts");
  await writeFile(script, `
import { writeFile } from "node:fs/promises";
import { withBuildArtifactOwnership } from "../lib/build-ownership.js";
import { generateOwnedBuildStaging } from "../lib/build-entry.js";
void withBuildArtifactOwnership({ packageRoot: process.cwd(), operation: "blocked compiler fixture" }, async (lease) => {
  const staged = await generateOwnedBuildStaging(lease, "fast");
  await writeFile(".owner-finished", staged.directory);
}, { scheduleEvery: (tick) => {
  const timer = setInterval(tick, 20);
  timer.unref();
  return () => clearInterval(timer);
} }).catch((error) => { console.error(error); process.exitCode = 1; });
`);
  let owner!: ChildProcess;
  const done = new Promise<void>((resolve, reject) => {
    owner = execFile(process.execPath, ["--import", "tsx", script], { cwd: packageRoot }, (error) => {
      if (error === null) resolve();
      else reject(new Error(error.message, { cause: error }));
    });
    owner.stdin?.end();
  });
  void done.catch(() => undefined);
  return { root, packageRoot, readyPath, releasePath, owner, done,
    cleanupCompiler: async () => {
      if (process.platform === "win32" && surviveOwnerDeath) await cleanupDetachedCompiler(packageRoot);
    } };
}

async function cleanupDetachedCompiler(packageRoot: string): Promise<void> {
  const raw = await readFile(join(packageRoot, ".compiler-pid"), "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (raw === undefined) return;
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Native compiler PID record is invalid");
  const diagnostics = await readFile(join(packageRoot, ".compiler-diagnostics"), "utf8").catch(() => "");
  if (diagnostics.includes('"event":"exit","pid":' + pid + ',')) return;
  try { process.kill(pid, "SIGKILL"); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") return;
    throw error;
  }
  const deadline = Date.now() + 3_000;
  while (true) {
    try { process.kill(pid, 0); }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") return;
      throw error;
    }
    if (Date.now() >= deadline) throw new Error("Native compiler did not stop before fixture cleanup");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
