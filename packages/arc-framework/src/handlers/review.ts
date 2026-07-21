/** Machine-readable review workflow handlers. */

import { readFile } from "node:fs/promises";

import { gitExec } from "../lib/io-context.js";
import { resolveArcRoot } from "../lib/paths.js";
import { createLocalFrontlineSourcePreferenceReader } from "../scripts/review-gate/hosts/local/frontline-source-preferences.js";
import { resolveFrontlineCommand } from "../scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../scripts/review-gate/policy/frontline-source.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Resolve one explicit frontline request and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewFrontlineResolve(source: string): Promise<void> {
  try {
    const root = resolveArcRoot(process.cwd());
    if (root === null) throw new Error("Not inside an ARC project.");
    const text = source === "-" ? await readStdin() : await readFile(source, "utf8");
    const request: unknown = JSON.parse(text);
    const result = await resolveFrontlineCommand(request, {
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: root,
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
      }),
      // Provider bindings are composition-owned; project activation alone installs none.
      registry: new FrontlineSourceRegistry([]),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      error: { code: "invalid-request", message },
    })}\n`);
    process.exitCode = 1;
  }
}
