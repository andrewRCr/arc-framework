import { describe, expect, it } from "vitest";

import {
  performRead,
  performWrite,
  resolveGitHubHttpConfig,
  restHeaders,
  type GitHubHttpConfig,
  type ReadTransportResult,
  type WriteTransportResult,
} from "../../../../../../../src/scripts/review-gate/hosts/github/api/http.js";
import { abortError, fetchFake, networkError, response, type FetchStep } from "./fetch-fake.js";

const TOKEN = "ghs_secretinstallationtoken000000000000";

function config(steps: FetchStep[], overrides: Partial<GitHubHttpConfig> = {}): {
  resolved: ReturnType<typeof resolveGitHubHttpConfig>;
  fake: ReturnType<typeof fetchFake>;
} {
  const fake = fetchFake(steps);
  const resolved = resolveGitHubHttpConfig({
    fetch: fake.fetch,
    token: TOKEN,
    sleep: fake.sleep,
    maxReadAttempts: 4,
    ...overrides,
  });
  return { resolved, fake };
}

function read(resolved: ReturnType<typeof resolveGitHubHttpConfig>): Promise<ReadTransportResult> {
  return performRead(resolved, "https://api.github.com/x", { method: "GET", headers: restHeaders(resolved, false) });
}

function write(resolved: ReturnType<typeof resolveGitHubHttpConfig>): Promise<WriteTransportResult> {
  return performWrite(resolved, "https://api.github.com/x", { method: "POST", headers: restHeaders(resolved, true), body: "{}" });
}

describe("performHttp reads", () => {
  it("returns the response and exposes header access on success", async () => {
    const { resolved, fake } = config([response(200, "ok", { Link: "<next>; rel=\"next\"" })]);
    const result = await read(resolved);
    expect(result).toMatchObject({ kind: "response", status: 200, body: "ok" });
    if (result.kind !== "response") throw new Error("expected response");
    expect(result.header("link")).toBe("<next>; rel=\"next\"");
    expect(fake.calls).toHaveLength(1);
  });

  it("retries a transient 503 then succeeds", async () => {
    const { resolved, fake } = config([response(503, "busy"), response(200, "ok")]);
    const result = await read(resolved);
    expect(result.kind).toBe("response");
    expect(fake.calls).toHaveLength(2);
    expect(fake.sleeps).toHaveLength(1);
  });

  it("fails unavailable with retry-exhausted after persistent 503", async () => {
    const { resolved, fake } = config([response(503, ""), response(503, ""), response(503, ""), response(503, "")]);
    const result = await read(resolved);
    expect(result).toEqual({ kind: "unavailable", reason: "retry-exhausted" });
    expect(fake.calls).toHaveLength(4);
  });

  it("treats 429 as a rate limit and honors Retry-After for backoff", async () => {
    const { resolved, fake } = config(
      [response(429, "", { "Retry-After": "2" }), response(429, "", { "Retry-After": "2" })],
      { maxReadAttempts: 2 },
    );
    const result = await read(resolved);
    expect(result).toEqual({ kind: "unavailable", reason: "rate-limited" });
    expect(fake.sleeps).toEqual([2_000]);
  });

  it("treats 403 with exhausted primary rate limit as rate-limited", async () => {
    const { resolved } = config([response(403, "", { "x-ratelimit-remaining": "0" })], { maxReadAttempts: 1 });
    expect(await read(resolved)).toEqual({ kind: "unavailable", reason: "rate-limited" });
  });

  it("retries a network error then fails unavailable network", async () => {
    const { resolved, fake } = config([networkError(), networkError(), networkError(), networkError()]);
    expect(await read(resolved)).toEqual({ kind: "unavailable", reason: "network" });
    expect(fake.calls).toHaveLength(4);
  });

  it("classifies an abort as a timeout", async () => {
    const { resolved } = config([abortError()], { maxReadAttempts: 1 });
    expect(await read(resolved)).toEqual({ kind: "unavailable", reason: "timeout" });
  });

  it("returns a definitive 404 without retry", async () => {
    const { resolved, fake } = config([response(404, "{\"message\":\"Not Found\"}")]);
    const result = await read(resolved);
    expect(result).toMatchObject({ kind: "response", status: 404 });
    expect(fake.calls).toHaveLength(1);
  });
});

describe("performHttp writes", () => {
  it("returns a definitive response without retry on success", async () => {
    const { resolved, fake } = config([response(201, "{}")]);
    expect(await write(resolved)).toMatchObject({ kind: "response", status: 201 });
    expect(fake.calls).toHaveLength(1);
  });

  it("marks a network failure ambiguous and does not resend", async () => {
    const { resolved, fake } = config([networkError()]);
    expect(await write(resolved)).toEqual({ kind: "ambiguous", reason: "network" });
    expect(fake.calls).toHaveLength(1);
  });

  it("marks a 500 ambiguous because the write may have applied", async () => {
    const { resolved } = config([response(500, "")]);
    expect(await write(resolved)).toEqual({ kind: "ambiguous", reason: "server" });
  });

  it("reports a rate-limited write as unavailable (pre-effect, not applied)", async () => {
    const { resolved } = config([response(429, "", { "Retry-After": "1" })]);
    expect(await write(resolved)).toEqual({ kind: "unavailable", reason: "rate-limited" });
  });

  it("returns a definitive 422 rejection as a response", async () => {
    const { resolved } = config([response(422, "{\"message\":\"Unprocessable\"}")]);
    expect(await write(resolved)).toMatchObject({ kind: "response", status: 422 });
  });
});

describe("token confidentiality", () => {
  it("applies the token to request headers but never surfaces it in a failure outcome", async () => {
    const { resolved, fake } = config([networkError("connect ECONNREFUSED")]);
    const result = await performWrite(resolved, "https://api.github.com/x", {
      method: "POST",
      headers: restHeaders(resolved, true),
      body: "{}",
    });
    expect(fake.calls[0]?.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(result).toEqual({ kind: "ambiguous", reason: "network" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
