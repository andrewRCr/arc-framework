/** Qualification-only direct minting for temporary GitHub installation-token format overrides. */

import { createPrivateKey, sign } from "node:crypto";

import { integerAt, objectAt, stringAt } from "../core/validation.js";
import {
  GITHUB_API_USER_AGENT,
  GITHUB_REST_API_VERSION,
  GITHUB_REST_BASE_URL,
  type HttpFetch,
  type HttpRequestInit,
} from "../hosts/github/api/http.js";
import type { ForcedTokenFormat, MintedQualificationToken } from "./token-qualification.js";

function base64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

/** Create the short-lived App JWT used only to reach installation-token mint endpoints. */
export function createAppJwt(clientId: string, privateKey: string, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 540, iss: clientId }));
  const unsigned = `${header}.${payload}`;
  try {
    return `${unsigned}.${base64Url(sign("RSA-SHA256", Buffer.from(unsigned), createPrivateKey(privateKey)))}`;
  } catch {
    throw new Error("token-qualification:app-jwt-signing-failed");
  }
}

async function request(fetch: HttpFetch, path: string, jwt: string, init: Partial<HttpRequestInit> = {}): Promise<unknown> {
  let response;
  try {
    response = await fetch(`${GITHUB_REST_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
        "User-Agent": GITHUB_API_USER_AGENT,
        ...(init.headers ?? {}),
      },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
  } catch (cause) {
    throw new Error("token-qualification:app-request-failed", { cause });
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`token-qualification:app-request-rejected:${response.status}`);
  }
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch (cause) {
    throw new Error("token-qualification:app-response-malformed", { cause });
  }
}

/** Resolve the pinned App slug/id and the selected repository's installation id through App-JWT reads. */
export async function resolveQualificationInstallation(input: {
  fetch: HttpFetch;
  jwt: string;
  owner: string;
  repo: string;
}): Promise<{ appId: string; appSlug: string; installationId: string }> {
  const [appValue, installationValue] = await Promise.all([
    request(input.fetch, "/app", input.jwt),
    request(input.fetch, `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/installation`, input.jwt),
  ]);
  const app = objectAt(appValue, "app");
  const installation = objectAt(installationValue, "installation");
  return {
    appId: String(integerAt(app.id, "app.id", 1)),
    appSlug: stringAt(app.slug, "app.slug"),
    installationId: String(integerAt(installation.id, "installation.id", 1)),
  };
}

function observedFormat(token: string): ForcedTokenFormat {
  const segments = token.split(".");
  if (token.startsWith("ghs_") && segments.length === 3) return "stateless";
  if (segments.length === 1) return "classic";
  throw new Error("token-qualification:forced-format-unrecognized");
}

/** Mint one exact-repository, least-privilege token under the temporary per-request override. */
export async function mintQualificationToken(input: {
  fetch: HttpFetch;
  jwt: string;
  installationId: string;
  repository: string;
  format: ForcedTokenFormat;
}): Promise<MintedQualificationToken> {
  const value = await request(
    input.fetch,
    `/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`,
    input.jwt,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Stateless-S2S-Token": input.format === "stateless" ? "enabled" : "disabled",
      },
      body: JSON.stringify({
        repositories: [input.repository],
        permissions: { checks: "write", pull_requests: "write", statuses: "read" },
      }),
    },
  );
  const token = stringAt(objectAt(value, "installationToken").token, "installationToken.token");
  return { token, observedFormat: observedFormat(token) };
}
