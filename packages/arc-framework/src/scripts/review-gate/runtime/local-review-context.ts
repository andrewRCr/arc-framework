/** Resolve repository-only review launcher coordinates through the developer's `gh` session. */

import {
  arrayAt,
  digestAt,
  integerAt,
  objectAt,
  ReviewRecordValidationError,
  stringAt,
} from "../core/validation.js";
import { decodeHostRef } from "../hosts/github/change-request.js";
import type { ProcessRunner } from "./gh-action-port.js";

/** Complete canonical context consumed by repository-only review launchers. */
export interface LocalReviewContext {
  repositoryRef: string;
  owner: string;
  repo: string;
  repositoryId: number;
  pullRequestNumber: number;
  changeRequestId: string;
  headSha: string;
  appSlug: string;
  expectedAppId: string;
  token: string;
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ReviewRecordValidationError(path, "malformed JSON");
  }
}

function validateHostRef(value: string): {
  cliRef: string;
  expectedRepositoryRef?: string;
  expectedNumber?: number;
} {
  if (/^[1-9]\d*$/u.test(value)) return { cliRef: value };
  const encoded = decodeHostRef(value);
  if (encoded !== null) {
    return {
      cliRef: String(encoded.number),
      expectedRepositoryRef: `${encoded.owner}/${encoded.repo}`,
      expectedNumber: encoded.number,
    };
  }
  const url = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/u.exec(value);
  if (url?.[1] !== undefined && url[2] !== undefined && url[3] !== undefined) {
    return {
      cliRef: url[3],
      expectedRepositoryRef: `${url[1]}/${url[2]}`,
      expectedNumber: Number.parseInt(url[3], 10),
    };
  }
  throw new ReviewRecordValidationError(
    "reviewContext.hostRef",
    "expected a canonical host reference, PR number, or GitHub PR URL",
  );
}

function splitRepositoryRef(value: unknown): { repositoryRef: string; owner: string; repo: string } {
  const repositoryRef = stringAt(value, "reviewContext.repository.nameWithOwner");
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u.exec(repositoryRef);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new ReviewRecordValidationError("reviewContext.repository.nameWithOwner", "expected owner/repository");
  }
  return { repositoryRef, owner: match[1], repo: match[2] };
}

function appIdFromVariables(input: unknown): string {
  const variables = arrayAt(input, "reviewContext.variables", (item, path) => {
    const record = objectAt(item, path);
    return {
      name: stringAt(record.name, `${path}.name`),
      value: stringAt(record.value, `${path}.value`),
    };
  });
  const matches = variables.filter((item) => item.name === "ARC_REVIEW_GATE_APP_ID");
  if (matches.length === 0) {
    throw new ReviewRecordValidationError("reviewContext.variables.ARC_REVIEW_GATE_APP_ID", "missing variable");
  }
  if (matches.length !== 1) {
    throw new ReviewRecordValidationError("reviewContext.variables.ARC_REVIEW_GATE_APP_ID", "expected one variable");
  }
  const value = matches[0]?.value;
  if (value === undefined || !/^[1-9]\d*$/u.test(value)) {
    throw new ReviewRecordValidationError("reviewContext.variables.ARC_REVIEW_GATE_APP_ID", "expected a positive integer string");
  }
  return value;
}

function appSlugFromIdentity(input: unknown): string {
  const login = stringAt(objectAt(input, "reviewContext.app").login, "reviewContext.app.login");
  if (!login.endsWith("[bot]") || login.length === "[bot]".length) {
    throw new ReviewRecordValidationError("reviewContext.app.login", "expected a [bot] login");
  }
  return login.slice(0, -"[bot]".length);
}

/**
 * Resolve one explicit pull request into every canonical coordinate needed by local launchers.
 *
 * @param input - Explicit PR reference, expected App bot identity, and injected process boundary.
 * @returns Validated repository, PR, App, head, and authentication context.
 */
export async function resolveLocalReviewContext(input: {
  hostRef: string;
  appBotUserId: string;
  process: ProcessRunner;
}): Promise<LocalReviewContext> {
  const hostRef = validateHostRef(input.hostRef);
  if (!/^[1-9]\d*$/u.test(input.appBotUserId)) {
    throw new ReviewRecordValidationError("reviewContext.appBotUserId", "expected a positive integer string");
  }
  const repositoryResult = await input.process.run("gh", ["repo", "view", "--json", "nameWithOwner"]);
  const repository = objectAt(parseJson(repositoryResult.stdout, "reviewContext.repository"), "reviewContext.repository");
  const { repositoryRef, owner, repo } = splitRepositoryRef(repository.nameWithOwner);
  if (hostRef.expectedRepositoryRef !== undefined
    && hostRef.expectedRepositoryRef.toLowerCase() !== repositoryRef.toLowerCase()) {
    throw new ReviewRecordValidationError("reviewContext.hostRef", "reference is outside the current repository");
  }

  const [repositoryResponse, pullResponse, variablesResponse, appResponse, tokenResponse] = await Promise.all([
    input.process.run("gh", ["api", `repos/${repositoryRef}`]),
    input.process.run("gh", ["pr", "view", hostRef.cliRef, "--repo", repositoryRef, "--json", "id,number,headRefOid"]),
    input.process.run("gh", ["variable", "list", "--repo", repositoryRef, "--json", "name,value"]),
    input.process.run("gh", ["api", `user/${input.appBotUserId}`]),
    input.process.run("gh", ["auth", "token"]),
  ]);
  const repositoryRecord = objectAt(
    parseJson(repositoryResponse.stdout, "reviewContext.repositoryApi"),
    "reviewContext.repositoryApi",
  );
  const pull = objectAt(parseJson(pullResponse.stdout, "reviewContext.pullRequest"), "reviewContext.pullRequest");
  const pullRequestNumber = integerAt(pull.number, "reviewContext.pullRequest.number", 1);
  if (hostRef.expectedNumber !== undefined && hostRef.expectedNumber !== pullRequestNumber) {
    throw new ReviewRecordValidationError("reviewContext.pullRequest.number", "does not match the host reference");
  }
  const token = tokenResponse.stdout.trim();
  if (token.length === 0) throw new ReviewRecordValidationError("reviewContext.token", "empty gh auth token");

  return {
    repositoryRef,
    owner,
    repo,
    repositoryId: integerAt(repositoryRecord.id, "reviewContext.repositoryApi.id", 1),
    pullRequestNumber,
    changeRequestId: stringAt(pull.id, "reviewContext.pullRequest.id"),
    headSha: digestAt(pull.headRefOid, "reviewContext.pullRequest.headRefOid", 40),
    appSlug: appSlugFromIdentity(parseJson(appResponse.stdout, "reviewContext.app")),
    expectedAppId: appIdFromVariables(parseJson(variablesResponse.stdout, "reviewContext.variables")),
    token,
  };
}
