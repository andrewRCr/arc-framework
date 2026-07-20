/** Reproducible, non-gating latency evidence for always-on session-envelope validation. */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { assertSessionInitProbeResult } from "../../src/commands/status/schema.js";
import {
  prepareSessionEnvelopeFixture,
  type SessionEnvelopeFixture,
} from "../helpers/session-envelope-compat.js";
import { runArcNoTty } from "../e2e/helpers.js";

const execFileAsync = promisify(execFile);
const WARMUP_WARM_SAMPLES = 20;
const RECORDED_WARM_SAMPLES = 1_000;
const WARMUP_COLD_SAMPLES = 5;
const RECORDED_COLD_SAMPLES = 30;
const VALIDATION_P50_LIMIT_MS = 5;
const VALIDATION_P95_LIMIT_MS = 20;
const VALIDATION_COLD_RATIO_LIMIT = 0.05;

interface Distribution {
  p50Ms: number;
  p95Ms: number;
}

interface TimedPair {
  validationMs: number;
  noOpMs: number;
}

let consumedFixture: unknown;

function consumeFixture(value: unknown): void {
  consumedFixture = value;
}

function measure(operation: () => void): number {
  const start = performance.now();
  operation();
  return performance.now() - start;
}

function pairedSample(envelope: unknown, index: number): TimedPair {
  if (index % 2 === 0) {
    const validationMs = measure(() => assertSessionInitProbeResult(envelope));
    const noOpMs = measure(() => consumeFixture(envelope));
    return { validationMs, noOpMs };
  }
  const noOpMs = measure(() => consumeFixture(envelope));
  const validationMs = measure(() => assertSessionInitProbeResult(envelope));
  return { validationMs, noOpMs };
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) throw new Error("percentile requires at least one sample");
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index] ?? sorted.at(-1) ?? 0;
}

function distribution(values: readonly number[]): Distribution {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function roundedDistribution(value: Distribution): Distribution {
  return { p50Ms: round(value.p50Ms), p95Ms: round(value.p95Ms) };
}

async function captureWarmEnvelope(fixture: SessionEnvelopeFixture): Promise<unknown> {
  const result = await runArcNoTty(
    ["status", "--session-init", "--write-compaction-seed", "--json"],
    fixture.cwd,
  );
  if (result.exitCode !== 0) throw new Error(`warm fixture capture failed: ${result.stderr}`);
  return JSON.parse(result.stdout) as unknown;
}

async function disableRemoteSync(fixture: SessionEnvelopeFixture): Promise<void> {
  const configPath = join(fixture.cwd, ".arc", "system", "arc-config.yml");
  const config = await readFile(configPath, "utf8");
  const next = /^session\.remote_sync:.*$/mu.test(config)
    ? config.replace(/^session\.remote_sync:.*$/mu, "session.remote_sync: disabled")
    : `${config.trimEnd()}\nsession.remote_sync: disabled\n`;
  await writeFile(configPath, next);
}

async function coldSample(fixture: SessionEnvelopeFixture): Promise<number> {
  const start = performance.now();
  const result = await runArcNoTty(["status", "--session-init", "--json"], fixture.cwd);
  const elapsedMs = performance.now() - start;
  if (result.exitCode !== 0) throw new Error(`cold fixture command failed: ${result.stderr}`);
  JSON.parse(result.stdout);
  return elapsedMs;
}

async function npmVersion(): Promise<string> {
  const { stdout } = await execFileAsync("npm", ["--version"]);
  return stdout.trim();
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  let warmFixture: SessionEnvelopeFixture | undefined;
  let coldFixture: SessionEnvelopeFixture | undefined;

  try {
    warmFixture = await prepareSessionEnvelopeFixture("orient");
    const envelope = await captureWarmEnvelope(warmFixture);
    assertSessionInitProbeResult(envelope);

    coldFixture = await prepareSessionEnvelopeFixture("orient");
    await disableRemoteSync(coldFixture);
    await coldSample(coldFixture);

    for (let index = 0; index < WARMUP_WARM_SAMPLES; index += 1) pairedSample(envelope, index);
    const warmPairs = Array.from(
      { length: RECORDED_WARM_SAMPLES },
      (_, index) => pairedSample(envelope, index),
    );

    for (let index = 0; index < WARMUP_COLD_SAMPLES; index += 1) await coldSample(coldFixture);
    const coldSamples: number[] = [];
    for (let index = 0; index < RECORDED_COLD_SAMPLES; index += 1) {
      coldSamples.push(await coldSample(coldFixture));
    }

    const validation = distribution(warmPairs.map(({ validationMs }) => validationMs));
    const noOp = distribution(warmPairs.map(({ noOpMs }) => noOpMs));
    const validationDelta = distribution(
      warmPairs.map(({ validationMs, noOpMs }) => validationMs - noOpMs),
    );
    const coldCommand = distribution(coldSamples);
    const validationToColdP50Ratio = validationDelta.p50Ms / coldCommand.p50Ms;
    const withinThresholds = validationDelta.p50Ms <= VALIDATION_P50_LIMIT_MS
      && validationToColdP50Ratio <= VALIDATION_COLD_RATIO_LIMIT
      && validationDelta.p95Ms <= VALIDATION_P95_LIMIT_MS;

    process.stdout.write(`${JSON.stringify({
      benchmark: "session-envelope-validation",
      environment: {
        os: `${platform()} ${release()}`,
        architecture: arch(),
        node: process.version,
        npm: await npmVersion(),
      },
      setup: {
        build: "npm run build",
        warmFixture: "Orient/materialization full-slot session-init envelope captured once before normalization",
        coldFixture: "Orient/materialization repository with session.remote_sync disabled, prepared once",
        fixtureSetupIncludedInSamples: false,
        buildIncludedInSamples: false,
      },
      samples: {
        warm: { discarded: WARMUP_WARM_SAMPLES, recorded: RECORDED_WARM_SAMPLES },
        cold: { discarded: WARMUP_COLD_SAMPLES, recorded: RECORDED_COLD_SAMPLES },
      },
      results: {
        validation: roundedDistribution(validation),
        noOp: roundedDistribution(noOp),
        pairedValidationDelta: roundedDistribution(validationDelta),
        coldCommand: roundedDistribution(coldCommand),
        validationToColdP50Percent: round(validationToColdP50Ratio * 100),
      },
      thresholds: {
        validationP50MsAtMost: VALIDATION_P50_LIMIT_MS,
        validationP95MsAtMost: VALIDATION_P95_LIMIT_MS,
        validationP50PercentOfColdAtMost: VALIDATION_COLD_RATIO_LIMIT * 100,
        withinThresholds,
      },
      measuredRuntimeMs: round(performance.now() - startedAt),
    }, null, 2)}\n`);
    void consumedFixture;
  } finally {
    await coldFixture?.cleanup();
    await warmFixture?.cleanup();
  }
}

await main();
