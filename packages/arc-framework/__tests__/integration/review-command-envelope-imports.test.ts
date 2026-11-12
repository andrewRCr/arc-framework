/** Native module initialization must be independent of the review envelope entrypoint. */
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const envelopeUrl = new URL("../../src/scripts/review-gate/core/review-command-envelope.ts", import.meta.url).href;
const cancelUrl = new URL("../../src/scripts/review-gate/core/local-cancel-envelope.ts", import.meta.url).href;

it("initializes diagnostic-bearing envelopes from either native ESM entrypoint", async () => {
  for (const entry of [envelopeUrl, cancelUrl]) {
    const program = `
      await import(${JSON.stringify(entry)});
      const { ReviewCommandDiagnosticSchema } = await import(${JSON.stringify(envelopeUrl)});
      const { LocalCancelEnvelopeSchema } = await import(${JSON.stringify(cancelUrl)});
      const diagnostic = ReviewCommandDiagnosticSchema.parse({ code: "probe", message: "initialized" });
      console.log(JSON.stringify(LocalCancelEnvelopeSchema.parse({
        schemaVersion: 1, mode: "review-local-cancel", diagnostics: [diagnostic],
        state: "cancelled", nextAction: "rerun-review", payload: { operationId: "operation-1", persistedVersion: 1 },
      })));
    `;
    const result = await execute(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", program]);
    expect(JSON.parse(result.stdout)).toMatchObject({ state: "cancelled", diagnostics: [{ code: "probe", message: "initialized" }] });
  }
});
