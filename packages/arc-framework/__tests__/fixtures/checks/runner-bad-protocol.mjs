/** Emit malformed wire output without launching any provider children. */
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import process from "node:process";
const receipt = process.argv[2];
if (receipt === undefined) throw new Error("Expected capture receipt location");
createInterface({ input: process.stdin }).once("line", line => {
  /** @type {unknown} */
  const request = JSON.parse(line);
  if (typeof request !== "object" || request === null) throw new Error("Expected request object");
  /** @type {unknown} */
  const params = Reflect.get(request, "params");
  if (typeof params !== "object" || params === null) throw new Error("Expected preparation parameters");
  /** @type {unknown} */
  const planId = Reflect.get(params, "planId");
  /** @type {unknown} */
  const source = Reflect.get(params, "source");
  if (typeof planId !== "string" || typeof source !== "object" || source === null) throw new Error("Expected fixed preparation identity");
  appendFileSync(receipt, JSON.stringify(source) + "\n");
  const recovery = { jsonrpc: "2.0", method: "check/recovery", params: { planId,
    instructions: "This fixture launches no provider children; inspect its closed process before removing captured inputs." } };
  process.stdout.write(JSON.stringify(recovery) + "\nmalformed-frame\n", () => process.exit(0));
});
