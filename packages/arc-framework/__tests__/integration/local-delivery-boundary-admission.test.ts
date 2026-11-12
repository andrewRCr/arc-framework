/** Native delivery admission retains the stored boundary version across production status validation. */
import { expect, it } from "vitest";
import { createNativeDeliveryReviewRepository } from "../helpers/store/native-delivery-repository.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { resolveReviewStatus } from "../../src/scripts/review-gate/status.js";
import { createReviewStatusPort } from "../../src/scripts/review-gate/status-composition.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import type { GitExec } from "../../src/lib/git/exec.js";

it("rejects a moved native boundary during delivery admission and succeeds after a stable retry", async () => {
  const h = await createNativeDeliveryReviewRepository();
  const { cwd, realExec, primary, heads, obligation, access } = h;
  let moveBoundary = false;
  const exec: GitExec = async (command, args, options) => {
    if (moveBoundary && command === "git" && args[0] === "ls-remote") {
      moveBoundary = false;
      const current = await readSubmissionBoundaryVersioned(cwd, "example", access);
      if (current.boundary === null) throw new Error("Expected the native boundary");
      await writeSubmissionBoundary(cwd, IntegrationBoundaryLocusV2Schema.parse({ ...current.boundary,
        nextAction: { ...current.boundary.nextAction, interactionText: `${current.boundary.nextAction.interactionText} Retry after observation.` } }), current.version, access);
    }
    return realExec(command, args, options);
  };
  const input = { ...h.native, exec, workItem: primary.reference.owner };
  const status = await resolveReviewStatus({ target: { repository: "owner/repo", headRef: "member-1", headSha: heads[0]! },
    coverage: "complete", sourceId: "delegated-agent" }, createReviewStatusPort(input));
  expect(status, JSON.stringify(status)).toMatchObject({ nextAction: "review-local-prepare" });
  if (status.nextAction !== "review-local-prepare") throw new Error(JSON.stringify(status));
  const dependencies = createLocalPrepareDependencies(input);
  expect(await dependencies.validateDeliveryAdmission(status.action)).toEqual(obligation);
  moveBoundary = true;
  await expect(dependencies.validateDeliveryAdmission(status.action)).rejects.toThrow(
    "Local delivery-member review authority changed during admission validation.");
  expect(moveBoundary).toBe(false);
  expect(await dependencies.validateDeliveryAdmission(status.action)).toEqual(obligation);
}, 60_000);
