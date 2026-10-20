/** Bound source consumers use actual project authority while retaining portable producer coordinates. */
import { createStore } from "../../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../../src/lib/store/default-ports.js";
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createProjectIdentityReader, ProjectIdentityError } from "../../../../../src/lib/store/project-identity.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { parseReviewSourceReferenceForInvocation } from "../../../../../src/scripts/review-gate/runtime/source-invocation.js";

it.each(["attested-local", "frontline", "hosted"] as const)("reads a native %s source under its selected owner without Git", async kind => {
  const h = createReviewHarness();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example", { branch: null });
  const source = { repositoryId, workItem: primary.reference.owner, kind, operationId: "producer", durableRef: "result-key" };
  const invocation = { ...h, cwd: "/unavailable", exec: scriptGitExec([]).exec, workItem: primary.reference.owner };
  expect(await parseReviewSourceReferenceForInvocation(invocation, bindReviewSourceReference(source), kind)).toEqual(source);
});

it("preserves project repair before reading a bound native source", async () => {
  const h = createReviewHarness();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  const primary = await h.seedMeta("example", { branch: null });
  const source = { repositoryId, workItem: primary.reference.owner, kind: "hosted" as const, operationId: "producer", durableRef: "attempt" };
  const invocation = { ...h, cwd: "/unavailable", exec: scriptGitExec([]).exec, workItem: primary.reference.owner };
  await expect(parseReviewSourceReferenceForInvocation(invocation, bindReviewSourceReference(source), source.kind)).rejects.toBeInstanceOf(ProjectIdentityError);
  await h.seedProject(repositoryId);
  expect(await parseReviewSourceReferenceForInvocation({ ...invocation, projectId: createProjectIdentityReader(h.store) },
    bindReviewSourceReference(source), source.kind)).toEqual(source);
});

it.each(["foreign-project", "foreign-owner", "unbound", "repository"] as const)("refuses a %s source context and accepts its correction", async invalid => {
  const h = createReviewHarness();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example", { branch: null });
  const other = await h.seedMeta("another", { branch: null });
  const source = { repositoryId, workItem: primary.reference.owner, kind: "hosted" as const, operationId: "producer", durableRef: "attempt" };
  const exec = scriptGitExec([]).exec;
  const invocation = { ...h, cwd: "/unavailable", exec, workItem: primary.reference.owner };
  const store = createStore(createDefaultStorePorts({ exec, checkoutRoot: invocation.cwd }));
  const supplied = { ...invocation, store: invalid === "repository" ? store : h.store,
    workItem: invalid === "unbound" ? undefined : primary.reference.owner };
  const reference = bindReviewSourceReference({ ...source,
    repositoryId: invalid === "foreign-project" ? "another-project" : repositoryId,
    workItem: invalid === "foreign-owner" ? other.reference.owner : primary.reference.owner });
  await expect(parseReviewSourceReferenceForInvocation(supplied, reference, source.kind)).rejects.toThrow();
  expect(await parseReviewSourceReferenceForInvocation(invocation, bindReviewSourceReference(source), source.kind)).toEqual(source);
});
