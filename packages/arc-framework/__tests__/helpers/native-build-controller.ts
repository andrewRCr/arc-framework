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
}

/**
 * Block the actual schema producer while its owning process maintains artifact renewal.
 * @returns Caller-owned fixture, compiler barrier paths, and owning process completion
 */
export async function startBlockedBuildController(): Promise<NativeBuildController> {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const readyPath = join(packageRoot, ".compiler-ready");
  const releasePath = join(packageRoot, ".release-compiler");
  const schemaPath = join(packageRoot, "src/scripts/build-schema.ts");
  const schema = await readFile(schemaPath, "utf8");
  await writeFile(schemaPath, 'import { existsSync } from "node:fs";\n' + schema.replace(
    '  await mkdir(join(outDir, "schemas"), { recursive: true });',
    `  await writeFile(${JSON.stringify(readyPath)}, JSON.stringify({ pid: process.pid, directory: outDir }));
  while (!existsSync(${JSON.stringify(releasePath)})) await new Promise((resolve) => setTimeout(resolve, 10));
  await mkdir(join(outDir, "schemas"), { recursive: true });`,
  ));
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
    const blockedSchema = await readFile(schemaPath, "utf8");
    await writeFile(schemaPath, 'import { appendFileSync as recordSchemaDiagnostic } from "node:fs";\n'
      + blockedSchema.replace('  await mkdir(join(outDir, "schemas"), { recursive: true });',
        `  recordSchemaDiagnostic(${JSON.stringify(diagnosticPath)}, "release-observed\\n");
  await mkdir(join(outDir, "schemas"), { recursive: true });`)
        .replace('  await writeFile(join(outDir, "schemas/kernel.json"), JSON.stringify(schemas));',
          `  await writeFile(join(outDir, "schemas/kernel.json"), JSON.stringify(schemas));
  recordSchemaDiagnostic(${JSON.stringify(diagnosticPath)}, "schema-finished\\n");`));
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
  return { root, packageRoot, readyPath, releasePath, owner, done };
}
