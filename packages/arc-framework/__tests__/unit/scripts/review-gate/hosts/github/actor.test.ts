import { describe, expect, it } from "vitest";

import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import { normalizeActor, resolveActorCapabilities } from "../../../../../../src/scripts/review-gate/hosts/github/actor.js";
import { fetchFake, response, type FetchStep } from "./api/fetch-fake.js";

function client(steps: FetchStep[]): GitHubRestClient {
  const fake = fetchFake(steps);
  return new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
}

function permissionPayload(roleName: string, user: Record<string, unknown> = {}): unknown {
  const legacy = roleName === "maintain" ? "write" : roleName === "triage" ? "read" : roleName;
  return {
    permission: legacy,
    role_name: roleName,
    user: { id: 7, node_id: "U_actor", login: "andrewRCr", type: "User", ...user },
  };
}

async function resolve(steps: FetchStep[], expectedActorId = "7", login = "andrewRCr"): ReturnType<typeof resolveActorCapabilities> {
  return resolveActorCapabilities({ rest: client(steps), owner: "o", repo: "r", login, expectedActorId });
}

describe("normalizeActor", () => {
  it("binds identity to immutable ids and keeps login for display", () => {
    expect(normalizeActor({ id: 12, node_id: "U_x", login: "Someone", type: "User" })).toEqual({
      identity: "12",
      nodeId: "U_x",
      login: "Someone",
      kind: "user",
    });
  });

  it("classifies a bot account", () => {
    expect(normalizeActor({ id: 1, node_id: "B", login: "app[bot]", type: "Bot" }).kind).toBe("bot");
  });
});

describe("resolveActorCapabilities role mapping", () => {
  for (const role of ["read", "triage", "write", "maintain", "admin"] as const) {
    it(`maps ${role} to exactly that permission without over-granting`, async () => {
      const result = await resolve([response(200, JSON.stringify(permissionPayload(role)))]);
      expect(result).toEqual({
        kind: "resolved",
        actor: { identity: "7", nodeId: "U_actor", login: "andrewRCr", kind: "user" },
        capabilities: { schemaVersion: 1, actorIdentity: "7", permissions: [role] },
      });
    });
  }

  it("falls back to the legacy permission field when role_name is absent", async () => {
    const payload = { permission: "admin", user: { id: 7, node_id: "U_actor", login: "andrewRCr", type: "User" } };
    const result = await resolve([response(200, JSON.stringify(payload))]);
    expect(result).toMatchObject({ kind: "resolved", capabilities: { permissions: ["admin"] } });
  });
});

describe("resolveActorCapabilities identity and fail-closed behavior", () => {
  it("resolves by numeric id even when the login case differs", async () => {
    const result = await resolve([response(200, JSON.stringify(permissionPayload("write", { login: "ANDREWrcr" })))], "7", "andrewrcr");
    expect(result).toMatchObject({ kind: "resolved", capabilities: { actorIdentity: "7" } });
  });

  it("fails identity-mismatch when the numeric actor id differs from expected", async () => {
    expect(await resolve([response(200, JSON.stringify(permissionPayload("admin", { id: 999 })))])).toEqual({
      kind: "identity-mismatch",
    });
  });

  it("fails closed on a bot account", async () => {
    const payload = permissionPayload("admin", { type: "Bot" });
    expect(await resolve([response(200, JSON.stringify(payload))])).toEqual({ kind: "bot-actor" });
  });

  it("reports removed access as no-access for a permission of none", async () => {
    const payload = { permission: "none", role_name: "none", user: { id: 7, node_id: "U_actor", login: "a", type: "User" } };
    expect(await resolve([response(200, JSON.stringify(payload))])).toEqual({ kind: "no-access" });
  });

  it("reports a non-collaborator (404) as no-access", async () => {
    expect(await resolve([response(404, "{\"message\":\"Not Found\"}")])).toEqual({ kind: "no-access" });
  });

  it("fails unavailable on a lookup failure", async () => {
    expect(await resolve([response(500, "")])).toMatchObject({ kind: "unavailable" });
  });

  it("fails unavailable on a malformed response", async () => {
    expect(await resolve([response(200, "{}")])).toEqual({ kind: "unavailable", reason: "malformed" });
  });
});
