/** GitHub Actions entry point for secretless discovery and per-PR reconciliation. */

import { appendFile, readFile } from "node:fs/promises";

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { createReconcileRuntime } from "./runtime/composition.js";
import { runDiscoveryMain } from "./runtime/discovery-main.js";
import { createAuthenticatedGitExec, productionFetch } from "./runtime/production-io.js";
import { runReconcileMain } from "./runtime/reconcile-main.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (operation === "discover") {
    const payload = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8")) as unknown;
    const output = await runDiscoveryMain({
      eventName: required("GITHUB_EVENT_NAME"),
      payload,
      expectedAppId: Number(required("ARC_REVIEW_GATE_APP_ID")),
      repository: required("GITHUB_REPOSITORY"),
      token: required("GITHUB_TOKEN"),
      fetch: productionFetch,
    });
    if (output !== null) await appendFile(required("GITHUB_OUTPUT"), `matrix=${output}\n`, "utf8");
    return;
  }
  if (operation === "reconcile") {
    const result = await runReconcileMain(process.env, {
      createRuntime: createReconcileRuntime,
      fetch: productionFetch,
      createGitExec: (gitToken) => createAuthenticatedGitExec(gitToken),
      policy: SELF_HOSTING_POLICY,
      now: new Date(),
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }
  throw new Error("usage: run-reconcile.ts <discover|reconcile>");
}

await main();
