/** Drop only the frontend after a real provider publishes failure with descendants still owned. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import process from "node:process";

const [provider, stateRoot, observations] = process.argv.slice(2);
if (provider === undefined || stateRoot === undefined || observations === undefined) throw new Error("Expected provider, state root, and observations");
const child = spawn(process.execPath, [provider, "--state-root", stateRoot], { stdio: "pipe" });
const input = createInterface({ input: process.stdin });
/** @type {{planId: string, source: Record<string, unknown>} | undefined} */
let preparation;
input.on("line", line => {
  /** @type {unknown} */
  const parsed = JSON.parse(line);
  const request = objectRecord(parsed);
  if (request === undefined) throw new Error("Expected a protocol request");
  if (request.method === "check/prepare") {
    const params = objectRecord(request.params);
    const source = objectRecord(params?.source);
    if (typeof params?.planId !== "string" || source === undefined) throw new Error("Expected prepared source and plan UUID");
    preparation = { planId: params.planId, source };
    writeFileSync(join(observations, "source"), JSON.stringify(preparation.source));
  }
  child.stdin.write(line + "\n");
});
input.on("close", () => child.stdin.end());
child.stdin.on("error", () => undefined);
child.stderr.pipe(process.stderr);
const output = createInterface({ input: child.stdout });
output.on("line", line => {
  /** @type {unknown} */
  const parsed = JSON.parse(line);
  const message = objectRecord(parsed);
  if (message === undefined) throw new Error("Expected a protocol message");
  const result = objectRecord(message.result);
  const params = objectRecord(message.params);
  const outcome = objectRecord(params?.outcome);
  if (result?.status === "ready") {
    if (preparation === undefined || typeof result.contextId !== "string") throw new Error("Expected a prepared context");
    writeFileSync(join(observations, "attempt"), JSON.stringify({
      planId: preparation.planId, contextId: result.contextId, source: preparation.source, providerPid: child.pid,
    }));
  }
  if (message.method === "check/outcome" && outcome?.status === "completed" && outcome.exitCode !== 0) {
    process.stdout.write(line + "\n", () => process.exit(0));
    return;
  }
  process.stdout.write(line + "\n");
});
child.on("close", code => {
  input.close(); process.stdin.destroy(); process.exitCode = code ?? 1;
});

/** @param {unknown} value @returns {Record<string, unknown> | undefined} */
function objectRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : undefined;
}
