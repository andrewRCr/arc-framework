/** Dependency-injectable authenticated-attestation entry composition. */

import type { GitExec } from "../../../lib/git/exec.js";
import { ingestAttestation } from "../core/attestations.js";
import { integerAt, objectAt, stringAt } from "../core/validation.js";
import type { HttpFetch } from "../hosts/github/api/http.js";
import type { SelfHostingPolicy } from "../policy/self-hosting/schema.js";
import type {
  AttestComposition,
  AttestRuntimeConfig,
  CompositionIo,
  CompositionSeams,
} from "./composition.js";

/** GitHub Actions environment consumed by the attest entry. */
export interface AttestMainEnv {
  ARC_REVIEW_GATE_APP_ID?: string;
  ARC_APP_TOKEN?: string;
  ARC_APP_SLUG?: string;
  ARC_DISPATCH_ACTOR_ID?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
}

/** Injected factory, IO builders, policy, and clock. */
export interface AttestMainDependencies {
  createRuntime: (
    config: AttestRuntimeConfig,
    io: CompositionIo,
    seams?: CompositionSeams,
  ) => Promise<AttestComposition>;
  fetch: HttpFetch;
  createGitExec: (gitToken: string) => GitExec;
  policy: SelfHostingPolicy;
  now: Date;
}

/** Durable append or exact replay outcome. */
export interface AttestMainResult {
  status: "appended" | "replay";
  ledgerVersion: number;
  durableEvidenceRef: string;
}

function requireEnv(env: AttestMainEnv, key: keyof AttestMainEnv): string {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${key}`);
  return value;
}

function splitRepository(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0 || rest.length > 0) {
    throw new Error("invalid-environment:GITHUB_REPOSITORY");
  }
  return { owner, repo };
}

function parseEvent(input: unknown): {
  repositoryId: number;
  pullRequestNumber: number;
  actorLogin: string;
  payload: string;
} {
  const event = objectAt(input, "event");
  const repository = objectAt(event.repository, "event.repository");
  const sender = objectAt(event.sender, "event.sender");
  const inputs = objectAt(event.inputs, "event.inputs");
  const payload = stringAt(inputs.payload, "event.inputs.payload");
  if (Buffer.byteLength(payload, "utf8") > 16_384) throw new Error("invalid-attestation-payload");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw new Error("invalid-attestation-payload");
  }
  objectAt(parsed, "attestation");
  return {
    repositoryId: integerAt(repository.id, "event.repository.id", 1),
    pullRequestNumber: integerAt(inputs.pull_request, "event.inputs.pull_request", 1),
    actorLogin: stringAt(sender.login, "event.sender.login"),
    payload,
  };
}

function usedRunIds(receipts: Awaited<ReturnType<AttestComposition["store"]["readLedger"]>>["receipts"]): string[] {
  return receipts.flatMap(({ receipt }) => {
    const match = /^attestation:(.+):[a-f0-9]{64}$/u.exec(receipt.eventId);
    return match?.[1] === undefined ? [] : [match[1]];
  });
}

/** Resolve live validation context, ingest, and durably append one attestation. */
export async function runAttestMain(
  env: AttestMainEnv,
  eventPayload: unknown,
  deps: AttestMainDependencies,
): Promise<AttestMainResult> {
  const event = parseEvent(eventPayload);
  const { owner, repo } = splitRepository(requireEnv(env, "GITHUB_REPOSITORY"));
  const config: AttestRuntimeConfig = {
    owner,
    repo,
    repositoryId: event.repositoryId,
    pullRequestNumber: event.pullRequestNumber,
    appToken: requireEnv(env, "ARC_APP_TOKEN"),
    appSlug: requireEnv(env, "ARC_APP_SLUG"),
    expectedAppId: requireEnv(env, "ARC_REVIEW_GATE_APP_ID"),
    dispatchActorLogin: event.actorLogin,
    dispatchActorId: requireEnv(env, "ARC_DISPATCH_ACTOR_ID"),
    policy: deps.policy,
  };
  const io: CompositionIo = { fetch: deps.fetch, exec: deps.createGitExec(requireEnv(env, "GITHUB_TOKEN")) };
  const composition = await deps.createRuntime(config, io);
  const resolved = await composition.resolveValidationContext();
  const ledger = await composition.store.readLedger(resolved.changeRequestId);
  if (ledger.kind !== "valid") throw new Error(`attestation-ledger-degraded:${ledger.diagnostics.join(",")}`);
  const priorReceipts = ledger.receipts.map((envelope) => envelope.receipt);
  const ingested = ingestAttestation({
    content: event.payload,
    context: {
      requirement: resolved.requirement,
      authenticatedActor: resolved.authenticatedActor,
      acceptedReviewerClaims: resolved.acceptedReviewerClaims,
      acceptedRuntimeKinds: resolved.acceptedRuntimeKinds,
      usedRunIds: usedRunIds(ledger.receipts),
      authorIdentity: resolved.authorIdentity,
      now: deps.now,
      maxRunAgeMinutes: resolved.maxRunAgeMinutes,
    },
    repositoryId: resolved.repositoryId,
    changeRequestId: resolved.changeRequestId,
    expectedLedgerVersion: ledger.ledgerVersion,
    priorReceipts,
  });
  if (!ingested.ok) throw new Error(`attestation-rejected:${ingested.error}`);
  if (ingested.replay) {
    const envelope = ledger.receipts.find((item) => item.receipt.receiptHash === ingested.receipt.receiptHash);
    if (envelope === undefined) throw new Error("attestation-replay-missing-envelope");
    return { status: "replay", ledgerVersion: envelope.ledgerVersion, durableEvidenceRef: envelope.durableRecordId };
  }
  const appended = await composition.store.appendReceipt(ingested.receipt, ledger.ledgerVersion);
  return { status: "appended", ...appended };
}
