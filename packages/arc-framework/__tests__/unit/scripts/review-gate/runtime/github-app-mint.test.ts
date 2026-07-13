import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { HttpFetch, HttpRequestInit } from "../../../../../src/scripts/review-gate/hosts/github/api/http.js";
import {
  createAppJwt,
  mintQualificationToken,
  resolveQualificationInstallation,
} from "../../../../../src/scripts/review-gate/runtime/github-app-mint.js";

function reply(value: unknown): { status: number; headers: { get(): null }; text(): Promise<string> } {
  return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(value) };
}

describe("qualification-only GitHub App mint", () => {
  it("creates a signed short-lived App JWT without embedding the private key", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = createAppJwt("Iv1.client", pem, new Date("2026-07-12T20:00:00Z"));
    expect(jwt.split(".")).toHaveLength(3);
    expect(jwt).not.toContain(pem.slice(0, 20));
  });

  it("resolves the App and sends exact scoped forced-format mint requests", async () => {
    const calls: Array<{ url: string; init: HttpRequestInit }> = [];
    const fetch = vi.fn(async (url: string, init: HttpRequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/app")) return reply({ id: 4268856, slug: "arc-review-gate-andrewrcr" });
      if (url.includes("/installation") && !url.includes("access_tokens")) return reply({ id: 145772297 });
      return reply({ token: init.headers["X-GitHub-Stateless-S2S-Token"] === "enabled" ? "ghs_a.b.c" : "classic-token" });
    }) as unknown as HttpFetch;
    await expect(resolveQualificationInstallation({ fetch, jwt: "app.jwt.value", owner: "o", repo: "r" }))
      .resolves.toEqual({ appId: "4268856", appSlug: "arc-review-gate-andrewrcr", installationId: "145772297" });
    await expect(mintQualificationToken({
      fetch, jwt: "app.jwt.value", installationId: "145772297", repository: "r", format: "stateless",
    })).resolves.toMatchObject({ observedFormat: "stateless" });
    await expect(mintQualificationToken({
      fetch, jwt: "app.jwt.value", installationId: "145772297", repository: "r", format: "classic",
    })).resolves.toMatchObject({ observedFormat: "classic" });
    const mintCalls = calls.filter(({ url }) => url.endsWith("/access_tokens"));
    expect(mintCalls.map(({ init }) => init.headers["X-GitHub-Stateless-S2S-Token"])).toEqual(["enabled", "disabled"]);
    expect(mintCalls.map(({ init }) => JSON.parse(init.body ?? "") as unknown)).toEqual([
      { repositories: ["r"], permissions: { checks: "write", pull_requests: "write", statuses: "read" } },
      { repositories: ["r"], permissions: { checks: "write", pull_requests: "write", statuses: "read" } },
    ]);
  });

  it("retains request status and transport or parsing causes without exposing credentials", async () => {
    const input = { jwt: "app.jwt.value", installationId: "145772297", repository: "r", format: "classic" as const };
    const rejected = vi.fn(async () => ({ status: 429, headers: { get: () => null }, text: async () => "failure" })) as unknown as HttpFetch;
    await expect(mintQualificationToken({ ...input, fetch: rejected }))
      .rejects.toThrow("token-qualification:app-request-rejected:429");

    const transportCause = new Error("connection reset");
    const failed = vi.fn(async () => { throw transportCause; }) as unknown as HttpFetch;
    await expect(mintQualificationToken({ ...input, fetch: failed }))
      .rejects.toMatchObject({ message: "token-qualification:app-request-failed", cause: transportCause });

    const malformed = vi.fn(async () => ({ status: 200, headers: { get: () => null }, text: async () => "not-json" })) as unknown as HttpFetch;
    await expect(mintQualificationToken({ ...input, fetch: malformed }))
      .rejects.toMatchObject({ message: "token-qualification:app-response-malformed", cause: expect.any(SyntaxError) });
  });
});
