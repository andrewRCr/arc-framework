/** Compare source revisions in isolated processes on one runner, preserving unadjusted start and host controls. */
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { PreparedRepositoryTemplate } from "../helpers/prepared-repository.js";
import type { TimingSample } from "../helpers/store/projection/timing-observer.js";

const BASELINE = "53a349d7cbb85f8998f259a37574066c43e1b713";
const FILE = "__tests__/integration/store-ref-projection-start-control.test.ts";
const packageRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(packageRoot, "../..");
const execute = promisify(execFile);
const SAMPLES = 11;
const TIMEOUT = 240_000;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Operation = "start" | "beneathGit" | "gitPair" | "gitSingle";
interface Block {
  pid: number; source: string; namespaceHash: string; configurationHash: string;
  samples: Record<Operation, TimingSample[]>; mediansMs: Record<Operation, number>;
}

async function git(...args: string[]): Promise<string> {
  return (await execute("git", args, { cwd: repositoryRoot, maxBuffer: 128 * 1024 * 1024 })).stdout.trim();
}

async function extractBaseline(destination: string): Promise<void> {
  const archive = await execute("git", ["archive", BASELINE, "packages/arc-framework"], {
    cwd: repositoryRoot, encoding: "buffer", maxBuffer: 128 * 1024 * 1024,
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", "-", "--strip-components=2", "-C", destination], { stdio: ["pipe", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", chunk => { error += String(chunk); });
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", code => { if (code === 0) resolve(); else reject(new Error(`Baseline extraction failed: ${code}: ${error}`)); });
    child.stdin.end(archive.stdout);
  });
}

async function runBlock(directory: string, source: string, template: PreparedRepositoryTemplate, block: number): Promise<Block> {
  const output = join(directory, `block-${block}.json`), config = join(directory, "vitest.config.mjs");
  const { stdout, stderr } = await execute(process.execPath, [
    join(repositoryRoot, "node_modules/vitest/vitest.mjs"), "run", "--config", config, "--maxWorkers=1", FILE,
  ], { cwd: packageRoot, timeout: TIMEOUT, maxBuffer: 16 * 1024 * 1024, env: {
    ...process.env, FORCE_COLOR: "0", ARC_PROJECTION_CONTROL_SOURCE: source,
    ARC_PROJECTION_CONTROL_TEMPLATE: JSON.stringify(template), ARC_PROJECTION_CONTROL_OUTPUT: output,
  } });
  console.info(JSON.stringify({ kind: "projection-start-control-block-output", block, stdout, stderr }));
  return JSON.parse(await readFile(output, "utf8")) as Block;
}

async function controller(): Promise<void> {
  const fixtureModule = await import("../helpers/store/ref-projection-timing.js");
  const outputDirectory = join(packageRoot, ".test-cost-runs");
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, "start-control-"));
  const baselineRoot = join(directory, "baseline");
  await mkdir(baselineRoot);
  const fixture = await fixtureModule.createProjectionTimingTemplates({ archiveExtra: 0 });
  try {
    const current = await git("rev-parse", "HEAD");
    expect(await git("rev-parse", `${BASELINE}:package-lock.json`)).toBe(await git("rev-parse", `${current}:package-lock.json`));
    for (const file of ["ref-projection-timing.ts", "projection/timing-observer.ts"]) {
      const path = `packages/arc-framework/__tests__/helpers/store/${file}`;
      expect(await git("rev-parse", `${BASELINE}:${path}`)).toBe(await git("rev-parse", `${current}:${path}`));
    }
    await extractBaseline(baselineRoot);
    await writeFile(join(directory, "vitest.config.mjs"), `export default ${JSON.stringify({
      test: { root: packageRoot, include: [FILE], testTimeout: TIMEOUT, hookTimeout: TIMEOUT, maxWorkers: 1 },
    })};\n`);
    const blocks: (Block & { role: "baseline" | "current"; block: number })[] = [];
    const order = ["baseline", "current", "current", "baseline"] as const;
    for (const [block, role] of order.entries()) {
      blocks.push({ ...await runBlock(directory, role === "baseline" ? baselineRoot : packageRoot, fixture.baseline, block), role, block });
    }
    expect(new Set(blocks.map(block => block.pid)).size).toBe(4);
    expect(new Set(blocks.map(block => block.namespaceHash)).size).toBe(1);
    expect(new Set(blocks.map(block => block.configurationHash)).size).toBe(1);
    const result = { kind: "projection-start-source-control/v1", platform: process.platform, node: process.version,
      git: await git("--version"), samplesPerBlock: SAMPLES, files: 800, order,
      measured: "startProjection only, followed by untimed endProjection; fresh process and independent fixture copy per block",
      qualification: "diagnostic only; no timing credit or bound replacement",
      revisions: { baseline: { commit: BASELINE, sourceTree: await git("rev-parse", `${BASELINE}:packages/arc-framework/src`) },
        current: { commit: current, sourceTree: await git("rev-parse", `${current}:packages/arc-framework/src`) } },
      blocks,
    };
    await writeFile(join(outputDirectory, "projection-start-control.json"), JSON.stringify(result, null, 2) + "\n");
    console.info(JSON.stringify(result));
  } finally { await fixture.cleanup(); await rm(directory, { recursive: true, force: true }); }
}

async function sample(): Promise<void> {
  const source = process.env.ARC_PROJECTION_CONTROL_SOURCE!;
  const load = (path: string) => import(pathToFileURL(join(source, path)).href);
  const engine = await load("src/lib/store/projection/engine.ts") as typeof import("../../src/lib/store/projection/engine.js");
  const state = await load("src/lib/store/projection/process-state.ts") as typeof import("../../src/lib/store/projection/process-state.js");
  const observerModule = await load("__tests__/helpers/store/projection/timing-observer.ts") as typeof import("../helpers/store/projection/timing-observer.js");
  const fixtures = await load("__tests__/helpers/store/ref-projection-timing.ts") as typeof import("../helpers/store/ref-projection-timing.js");
  const indexes = await load("src/lib/store/projection/index-file.ts") as typeof import("../../src/lib/store/projection/index-file.js");
  const locations = await load("src/lib/store/projection/location.ts") as typeof import("../../src/lib/store/projection/location.js");
  const configuration = await load("src/lib/store/projection/configuration.ts") as typeof import("../../src/lib/store/projection/configuration.js");
  const walking = await load("src/lib/store/projection/engine-walk.ts") as typeof import("../../src/lib/store/projection/engine-walk.js");
  const statistics = await load("src/lib/store/projection/stat-observations.ts") as typeof import("../../src/lib/store/projection/stat-observations.js");
  const layout = await load("src/lib/layout/index.ts") as typeof import("../../src/lib/layout/index.js");
  const temporary = await load("__tests__/helpers/temp-repo.ts") as typeof import("../helpers/temp-repo.js");
  const template = JSON.parse(process.env.ARC_PROJECTION_CONTROL_TEMPLATE!) as PreparedRepositoryTemplate;
  const checkout = await fixtures.copyProjectionTimingRepository(template);
  try {
    const observer = new observerModule.ProjectionTimingObserver(), client = observer.client(checkout);
    const input = { checkout, store: client.store, ports: () => client.enginePorts };
    for (let i = 0; i < 2; i++) {
      expect(await engine.startProjection(input)).toMatchObject({ kind: "ready" });
      await engine.endProjection(input);
      expect(state.projectionProcessState().diagnostics).toEqual([]);
    }
    const config = await configuration.readProjectionConfiguration(client.enginePorts.exec, checkout);
    if (config.identity.status !== "identified") throw new Error("Missing timing identity");
    const roots = layout.projectedRootPaths(config.identity.identity).filter(path => path !== ".arc/completed");
    const location = await locations.locateProjection(checkout, client.enginePorts);
    const full = await indexes.readProjectionIndex(location, true, { groups: "all" });
    if (full.kind !== "index") throw new Error("Unusable control index");
    expect(Object.keys(full.index.entries)).toHaveLength(800);
    const namespace = async () => (await client.ports.rawExec(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    const namespaceHash = hash(await namespace());
    const configurationHash = hash((await client.enginePorts.exec("git", ["config", "--local", "--list"], { cwd: checkout })).stdout);
    const samples: Block["samples"] = { start: [], beneathGit: [], gitPair: [], gitSingle: [] };
    for (let i = 0; i < SAMPLES; i++) {
      const start = await observer.measure(() => engine.startProjection(input));
      expect(start.value.kind).toBe("ready"); expect(start.sample.gitCalls).toBe(2);
      await engine.endProjection(input);
      expect(state.projectionProcessState().diagnostics).toEqual([]);
      samples.start.push(start.sample);
      const beneath = await observer.measure(async () => {
        const [index, walked] = await Promise.all([indexes.readProjectionIndex(location, true, { groups: "walked" }), walking.walkProjectionRoots(checkout, roots)]);
        return { index, walked, stats: await statistics.readProjectionStats(checkout, walked.files) };
      });
      expect(beneath.value.index.kind).toBe("index"); expect(beneath.value.stats.size).toBe(320);
      expect(beneath.value.stats.size).toBe(beneath.value.walked.files.length); expect(beneath.sample.gitCalls).toBe(0);
      samples.beneathGit.push(beneath.sample);
      const pair = await observer.measure(() => Promise.all([client.store.version(), configuration.readProjectionConfiguration(client.enginePorts.exec, checkout)]));
      expect(pair.value[0].status).toBe("ok"); expect(pair.value[1].identity.status).toBe("identified");
      samples.gitPair.push(pair.sample);
      const single = await observer.measure(namespace);
      expect(hash(single.value)).toBe(namespaceHash); samples.gitSingle.push(single.sample);
    }
    const mediansMs = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, observerModule.medianTiming(values).medianMs])) as Block["mediansMs"];
    await writeFile(process.env.ARC_PROJECTION_CONTROL_OUTPUT!, JSON.stringify({ pid: process.pid, source, namespaceHash, configurationHash, samples, mediansMs }, null, 2) + "\n");
  } finally { await temporary.removeGitBackedDirs([checkout]); }
}

describe.skipIf(process.env.ARC_STORE_BURSTS !== "1")("isolated projection source timing control", () => {
  it("records old-current-current-old starts and independent host controls", async () => {
    if (process.env.ARC_PROJECTION_CONTROL_SOURCE) await sample();
    else await controller();
  }, 1_200_000);
});
