/** Execute CI preparation steps against real transferred Native compiler output. */
import { execFile } from "node:child_process";
import { cp, readFile, readdir, rm, symlink, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { execa } from "execa";
import { makeVitestRuntimeFixture } from "./vitest-runtime-fixture.js";

const execute = promisify(execFile);
const sourceRoot = resolve(import.meta.dirname, "../../../..");

/** CI steps read from the actual workflow rather than duplicated test commands. */
export interface CiBuildStep {
  id?: string;
  run?: string;
  uses?: string;
  env?: NodeJS.ProcessEnv;
  if?: string;
  with?: { path?: string; name?: string };
}

/**
 * Read a job's concrete CI steps.
 * @param job - Workflow job identifier
 * @returns The workflow's step sequence
 */
export async function ciBuildSteps(job: string): Promise<CiBuildStep[]> {
  const workflow = load(await readFile(join(sourceRoot, ".github/workflows/ci.yml"), "utf8")) as {
    jobs: Record<string, { steps: CiBuildStep[] }>;
  };
  const steps = workflow.jobs[job]?.steps;
  if (steps === undefined) throw new Error(`Missing CI job: ${job}`);
  return steps;
}

/**
 * Produce the real artifact through the workflow's npm build gate.
 * @param root - Disposable checkout root
 * @returns Native build status and diagnostics
 */
export async function runCiProducer(root: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const step = (await ciBuildSteps("setup")).find((candidate) => candidate.run?.startsWith("npm run build"));
  if (step?.run === undefined) throw new Error("Missing CI build gate");
  const [command, ...args] = step.run.split(/\s+/u);
  if (command !== "npm") throw new Error(`Unsupported producer: ${step.run}`);
  const result = await execa(command, args, { cwd: root, env: { ARC_E2E_SKIP_BUILD: "" },
    reject: false, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return { code: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Transfer the actual uploaded output directory into a separate consumer checkout.
 * @param producer - Full-build producing package
 * @param job - Downloading CI consumer
 * @returns Caller-owned consumer fixture
 */
export async function downloadCiBuild(producer: string, job: string): Promise<Awaited<ReturnType<typeof makeVitestRuntimeFixture>>> {
  const upload = (await ciBuildSteps("setup")).find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  const download = (await ciBuildSteps(job)).find((step) => step.uses?.startsWith("actions/download-artifact@"));
  if (upload?.with?.path === undefined || download?.with?.path === undefined
    || upload.with.name !== download.with.name) throw new Error("Missing or mismatched artifact transfer");
  const fixture = await makeVitestRuntimeFixture();
  await rm(join(fixture.packageRoot, "dist"), { recursive: true });
  const source = join(resolve(producer, "../.."), upload.with.path);
  await cp(source, join(fixture.root, download.with.path), { recursive: true });
  return fixture;
}

/**
 * Run a workflow's Native preparation command with its declared environment.
 * @param fixture - Actual consumer checkout
 * @param job - Consuming workflow job
 * @param node - Real consuming Node executable
 * @returns Preparation status and retained diagnostics; absent preflight leaves output untouched
 */
export async function runCiPreflight(fixture: { root: string }, job: string, node = process.execPath): Promise<{
  code: number; stdout: string; stderr: string;
}> {
  const step = (await ciBuildSteps(job)).find((candidate) => candidate.id === "runtime-preflight");
  if (step?.run === undefined) return { code: 0, stdout: "", stderr: "" };
  const [command, ...args] = step.run.trim().split(/\s+/u);
  if (command !== "node") throw new Error(`Unsupported fixture command: ${step.run}`);
  const env = { ...process.env, CI: "1", ...step.env };
  try {
    const { stdout, stderr } = await execute(node, args,
      { cwd: fixture.root, env, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/**
 * Give only this fixture writable npm installation metadata while retaining real installed tools.
 * @param root - Disposable checkout root
 * @returns Private metadata file and its unmodified npm-produced contents
 */
export async function isolateCiInstallation(root: string): Promise<{ file: string; original: string }> {
  const shared = join(sourceRoot, "node_modules");
  const local = join(root, "node_modules");
  await unlink(local);
  await mkdir(local);
  for (const entry of await readdir(shared, { withFileTypes: true })) {
    if (entry.name === ".package-lock.json") continue;
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      await symlink(join(shared, entry.name), join(local, entry.name), "junction");
    } else await cp(join(shared, entry.name), join(local, entry.name));
  }
  const file = join(local, ".package-lock.json");
  const original = await readFile(join(shared, ".package-lock.json"), "utf8");
  await writeFile(file, original);
  return { file, original };
}
