/** Forward a real independent adapter while injecting selected protocol and closure faults. */
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import process from "node:process";

const [provider, mode, receipt] = process.argv.slice(2);
if (provider === undefined || mode === undefined || receipt === undefined) throw new Error("Expected provider, fault and capture receipt");
const child = spawn(process.execPath, [provider, "--known-node-runtime"], { stdio: "pipe" });
const input = createInterface({ input: process.stdin });
input.on("line", line => {
  /** @type {unknown} */
  const request = JSON.parse(line);
  if (typeof request !== "object" || request === null) throw new Error("Expected protocol request");
  if (Reflect.get(request, "method") === "check/prepare") {
    /** @type {unknown} */
    const params = Reflect.get(request, "params");
    if (typeof params !== "object" || params === null) throw new Error("Expected preparation parameters");
    /** @type {unknown} */
    const source = Reflect.get(params, "source");
    appendFileSync(receipt, JSON.stringify(source) + "\n");
  }
  child.stdin.write(line + "\n");
});
input.on("close", () => child.stdin.end());
child.stdin.on("error", () => undefined);
process.stdout.on("error", () => child.stdin.end());
const output = createInterface({ input: child.stdout });
output.on("line", line => {
  /** @type {unknown} */
  const parsed = JSON.parse(line);
  const message = objectRecord(parsed);
  if (message === undefined) throw new Error("Expected provider message object");
  const result = objectRecord(message.result);
  const params = objectRecord(message.params);
  if (mode === "wrong-source" && result?.status === "ready") result.sourceDigest = `sha256:${"c".repeat(64)}`;
  if (mode === "missing-output" && result?.settled === true) result.outputComplete = false;
  if (mode === "conflicting-context" && message.method === "check/outcome" && params !== undefined) params.contextId = "another-context";
  if (mode === "failure-loss" && result?.settled === true) {
    process.stdout.write("malformed-frame\n");
    child.stdin.end();
    return;
  }
  process.stdout.write(JSON.stringify(message) + "\n");
});
child.stderr.pipe(process.stderr);
child.on("close", code => {
  input.close();
  process.stdin.destroy();
  process.exitCode = mode === "bad-close" ? 1 : code ?? 1;
});

/** @param {unknown} value @returns {Record<string, unknown> | undefined} */
function objectRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : undefined;
}
