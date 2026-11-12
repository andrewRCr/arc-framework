/** Hosted delivery admission uses the selected native records and injected host at every re-check. */
import { expect, it } from "vitest";
import { createNativeDeliveryReviewRepository } from "../helpers/store/native-delivery-repository.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { handleReviewHostedRequest, handleReviewStatus, handleReviewChangeRequestResolve } from "../../src/handlers/review.js";
import { ChangeRequestResolveResultSchema } from "../../src/scripts/review-gate/change-request.js";
import { ReviewStatusCommandResultSchema } from "../../src/scripts/review-gate/status.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import type { HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";

it.each([false, true])("re-checks the native hosted member before admission (outstanding member moved: %s)", async moved => {
  const h = await createNativeDeliveryReviewRepository("member-1", "codex-pr");
  const invocation = { cwd: h.cwd, store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store), exec: h.realExec };
  let output = "";
  await handleReviewChangeRequestResolve({ headRef: "member-1", headSha: h.heads[0]!, requireRemote: true }, undefined,
    { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} });
  const resolved = ChangeRequestResolveResultSchema.parse(JSON.parse(output));
  if (resolved.state !== "open") throw new Error(JSON.stringify(resolved));
  output = "";
  await handleReviewStatus({ target: JSON.stringify(resolved.targetRef), source: "codex-pr", coverage: "complete" }, undefined,
    { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} }, invocation);
  const offered = ReviewStatusCommandResultSchema.parse(JSON.parse(output));
  if (offered.nextAction !== "review-hosted-request" || offered.action.vehicle?.kind !== "delivery-member") throw new Error(JSON.stringify(offered));
  const request = offered.action, vehicle = offered.action.vehicle;
  if (moved) {
    const decisions = createReviewDecisionPort(h.reference.store, h.primary.reference.owner);
    const recorded = await decisions.create({ schemaVersion: 1, lane: "standard", subject: { lineage: {
      kind: "delivery-member", planId: vehicle.planId, deliverableId: vehicle.deliverableId, workUnitId: vehicle.workUnitId },
    headSha: vehicle.head, subjectDigest: null }, choice: { kind: "terminus" }, decidedBy: "andrew",
    decidedAt: "2026-11-01T12:00:00Z", basis: { passCount: 0 } });
    const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", h.access);
    if (snapshot.boundary?.schemaVersion !== 2) throw new Error("Expected native boundary");
    await writeSubmissionBoundary(h.cwd, { ...snapshot.boundary, deliveryReviewTermini: [
      { vehicle, terminus: reviewDecisionKey(recorded.value) }] }, snapshot.version, h.access);
  }
  const hostedRunner: HostedProcessRunner = { run: async (args, options) => {
    if (args[0] === "api" && args[1] === "user") return { stdout: JSON.stringify({ id: 123 }), stderr: "" };
    if (args[0] === "api" && args[1]?.endsWith("/comments") && args.includes("POST")) return { stdout: JSON.stringify({
      node_id: "request-1", html_url: "https://github.com/owner/repo/pull/41#issuecomment-1", user: { id: 123 },
      body: "@codex review", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }), stderr: "" };
    const executed = await h.realExec("gh", [...args], { ...options, cwd: h.cwd });
    return { stdout: executed.stdout, stderr: executed.stderr ?? "" };
  } };
  output = "";
  await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(request),
    write: text => { output += text; }, setExitCode: () => {} }, undefined, { ...invocation, hostedRunner });
  expect(JSON.parse(output), output).toMatchObject(moved ? { error: { message: expect.stringMatching(
    /first outstanding delivery member|fresh discharge position/u) } } : { state: "requested" });
}, 60_000);
