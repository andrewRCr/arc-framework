/** GitHub Actions entry point for secretless discovery and per-PR reconciliation. */

import { appendFile, readFile } from "node:fs/promises";

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { selectReconcilePolicy } from "./policy/self-hosting/qualification.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { createAuthenticatedGitExec, productionFetch } from "./runtime/production-io.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

function positiveInteger(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid-environment:${name}`);
  return value;
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (operation === "discover") {
    const payload = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8")) as unknown;
    const output = await SELF_HOSTING_REVIEW_GATE.runDiscoveryMain({
      eventName: required("GITHUB_EVENT_NAME"),
      payload,
      expectedAppId: positiveInteger("ARC_REVIEW_GATE_APP_ID"),
      repository: required("GITHUB_REPOSITORY"),
      token: required("GITHUB_TOKEN"),
      fetch: productionFetch,
    });
    if (output !== null) await appendFile(required("GITHUB_OUTPUT"), `matrix=${output}\n`, "utf8");
    return;
  }
  if (operation === "reconcile") {
    const policy = selectReconcilePolicy(SELF_HOSTING_POLICY, {
      eventName: required("GITHUB_EVENT_NAME"),
      qualificationMode: process.env.ARC_QUALIFICATION_MODE,
      qualificationProvider: process.env.ARC_QUALIFICATION_PROVIDER,
      qualificationGuidanceDigest: process.env.ARC_QUALIFICATION_GUIDANCE_DIGEST,
    });
    const result = await SELF_HOSTING_REVIEW_GATE.runReconcileMain(process.env, {
      createRuntime: SELF_HOSTING_REVIEW_GATE.createReconcileRuntime,
      fetch: productionFetch,
      createGitExec: (gitToken) => createAuthenticatedGitExec(gitToken),
      policy,
      now: new Date(),
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }
  throw new Error("usage: run-reconcile.ts <discover|reconcile>");
}

await main();
