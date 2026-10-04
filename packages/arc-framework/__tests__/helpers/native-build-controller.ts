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
