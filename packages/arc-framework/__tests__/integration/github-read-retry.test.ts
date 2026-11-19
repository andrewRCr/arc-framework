/** Read retries across a real process boundary, including refusal and repair. */

import { afterEach, describe, expect, it } from "vitest";
import { execa } from "execa";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GhHostedReviewPort, HostedProcessError, type HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";
import { createGhRequiredChecksPort, readGhRequiredStatusPolicy } from "../../src/scripts/review-gate/hosts/github/checks-await.js";
import { observeRequiredChecks } from "../../src/scripts/review-gate/checks-await.js";

const HEAD = "a".repeat(40);
const target = { repository: "owner/repo", pullRequest: 42, headSha: HEAD };
const roots: string[] = [];
type FixtureCall = { args: string[]; failed: boolean; claimedSlot: string | null };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(failures: number, onFailure?: () => void) {
  const root = await mkdtemp(join(tmpdir(), "arc-gh-read-retry-"));
  roots.push(root);
  const script = join(root, "gh.mjs");
  const callsDirectory = join(root, "calls");
  const failureDirectory = join(root, "failures");
  await mkdir(callsDirectory);
  await mkdir(failureDirectory);
  await writeFile(script, `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const [root, ...args] = process.argv.slice(2);
let failed = false;
let claimedSlot = null;
if (args[0] !== "repo") {
  for (let slot = 0; slot < ${failures}; slot++) {
    try {
      writeFileSync(join(root, "failures", String(slot)), "", { flag: "wx" });
      failed = true;
      claimedSlot = String(slot);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}
writeFileSync(join(root, "calls", randomUUID() + ".json"), JSON.stringify({ args, failed, claimedSlot }), { flag: "wx" });
if (failed) {
  process.stderr.write("gh: Service Unavailable (HTTP 503)\\n");
  process.exit(1);
}
if (args[0] === "repo") console.log(JSON.stringify({ nameWithOwner: "owner/repo" }));
else if (args[0] === "pr") console.log(JSON.stringify([{ name: "build", state: "SUCCESS", bucket: "pass" }]));
else if (args.some((arg) => arg.includes("/rules/branches/"))) console.log("[[]]");
else if (args.some((arg) => arg.includes("/branches/"))) console.log(JSON.stringify({ protected: false }));
else console.log(JSON.stringify({ head: { sha: "${HEAD}" }, base: { ref: "main" }, id: 7 }));
`);
  const runner: HostedProcessRunner = {
    run: async (args, options) => {
      const result = await execa(process.execPath, [script, root, ...args], {
        reject: false,
        env: { FORCE_COLOR: undefined },
        ...(options?.signal === undefined ? {} : { cancelSignal: options.signal }),
      });
      if (result.failed) {
        if (result.exitCode !== 1 || result.stderr.trim() !== "gh: Service Unavailable (HTTP 503)") {
          throw new Error(`Unexpected fixture process failure: ${result.stderr}`);
        }
        onFailure?.();
        throw new HostedProcessError("GitHub CLI failed", result.stderr, result.exitCode ?? null, 503, result.stdout);
      }
      return { stdout: result.stdout, stderr: result.stderr };
    },
  };
  const outcomes = async (): Promise<FixtureCall[]> => Promise.all((await readdir(callsDirectory))
    .map(async (name) => JSON.parse(await readFile(join(callsDirectory, name), "utf8")) as FixtureCall));
  return {
    runner,
    outcomes,
    calls: async (): Promise<string[][]> => (await outcomes()).map(({ args }) => args),
    breakScript: async () => {
      const original = await readFile(script, "utf8");
      await writeFile(script, 'throw new Error("unexpected fixture failure");');
      return () => writeFile(script, original);
    },
  };
}

describe("GitHub read retry process composition", () => {
  it.each([0, 1])("retains concurrent policy reads and shares exactly %i failure slots", async (failures) => {
    const { runner, calls, outcomes } = await fixture(failures);
    await expect(readGhRequiredStatusPolicy(runner, target.repository, "main", new AbortController().signal))
      .resolves.toEqual({ contexts: [], strictCurrentness: false });
    const recorded = await calls();
    const observed = await outcomes();
    expect(recorded, JSON.stringify(observed)).toHaveLength(2 + failures);
    expect(observed.filter(({ failed }) => failed), JSON.stringify(observed)).toHaveLength(failures);
    expect(recorded.flat()).toContain("repos/owner/repo/branches/main");
    expect(recorded.flat()).toContain("repos/owner/repo/rules/branches/main?per_page=100");
  });

  it("reports an unexpected child failure without inventing HTTP 503 and permits repair", async () => {
    const { runner, breakScript } = await fixture(0);
    const repair = await breakScript();
    const port = new GhHostedReviewPort(runner);
    await expect(port.readHead(target)).rejects.toMatchObject({
      kind: "terminal-failure", message: expect.stringContaining("unexpected fixture failure"),
    });
    await repair();
    await expect(port.readHead(target)).resolves.toBe(HEAD);
  });

  it("recovers one 503 without changing the observed head", async () => {
    const { runner, calls } = await fixture(1);
    await expect(new GhHostedReviewPort(runner).readHead(target)).resolves.toBe(HEAD);
    expect(await calls()).toHaveLength(2);
  });

  it("names the exhausted required-check read and succeeds after provider repair", async () => {
    const { runner } = await fixture(2);
    const dependencies = { port: createGhRequiredChecksPort(runner), signal: new AbortController().signal };
    await expect(observeRequiredChecks(target, dependencies)).resolves.toMatchObject({
      state: "unavailable", nextAction: "retry", cause: "provider",
      detail: expect.stringMatching(/GET repos\/owner\/repo\/pulls\/42 \(head identity\).*HTTP 503/u),
    });
    await expect(observeRequiredChecks(target, dependencies)).resolves.toMatchObject({
      state: "green", checks: [{ name: "build", state: "green" }],
    });
  });

  it("cancels the real backoff without starting a second process, then permits a fresh read", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Owner cancelled", "AbortError");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { runner, calls } = await fixture(1, () => {
      timer = setTimeout(() => controller.abort(reason), 25);
    });
    const port = new GhHostedReviewPort(runner);
    try {
      await expect(port.readHead(target, { signal: controller.signal })).rejects.toBe(reason);
      expect(await calls()).toHaveLength(1);
      await expect(port.readHead(target)).resolves.toBe(HEAD);
    } finally {
      clearTimeout(timer);
    }
  });

  it("keeps an uncertain comment write ambiguous instead of replaying it", async () => {
    const { runner, calls } = await fixture(1);
    const port = new GhHostedReviewPort(runner);
    await expect(port.postReply({ target, commentId: "7", body: "reply" }))
      .resolves.toEqual({ kind: "ambiguous" });
    expect(await calls()).toHaveLength(1);
    await expect(port.postReply({ target, commentId: "7", body: "reply" }))
      .resolves.toEqual({ kind: "created", id: "7" });
  });
});
