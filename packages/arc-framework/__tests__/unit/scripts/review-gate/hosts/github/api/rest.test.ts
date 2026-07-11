import { describe, expect, it } from "vitest";

import { GitHubRestClient, type ReadOutcome } from "../../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import { fetchFake, networkError, response, type FetchStep } from "./fetch-fake.js";

const TOKEN = "ghs_secretinstallationtoken000000000000";

function client(steps: FetchStep[], maxPages?: number): { rest: GitHubRestClient; fake: ReturnType<typeof fetchFake> } {
  const fake = fetchFake(steps);
  const rest = new GitHubRestClient({
    fetch: fake.fetch,
    token: TOKEN,
    sleep: fake.sleep,
    maxReadAttempts: 1,
    ...(maxPages === undefined ? {} : { maxPages }),
  });
  return { rest, fake };
}

interface Named {
  name: string;
}

function parseNamed(value: unknown): Named {
  if (value === null || typeof value !== "object" || typeof (value as { name?: unknown }).name !== "string") {
    throw new Error("expected a name field");
  }
  return { name: (value as { name: string }).name };
}

function parseNamedPage(value: unknown): Named[] {
  if (!Array.isArray(value)) throw new Error("expected an array page");
  return value.map(parseNamed);
}

describe("GitHubRestClient.get", () => {
  it("validates a JSON body through the caller's parser", async () => {
    const { rest } = client([response(200, "{\"name\":\"pr\"}")]);
    expect(await rest.get("/x", { parse: parseNamed })).toEqual({ kind: "ok", status: 200, value: { name: "pr" } });
  });

  it("reports an HTTP error with a sanitized message and no partial value", async () => {
    const { rest } = client([response(422, "{\"message\":\"Validation Failed\"}")]);
    expect(await rest.get("/x", { parse: parseNamed })).toEqual({
      kind: "http-error",
      status: 422,
      message: "Validation Failed",
    });
  });

  it("reports invalid JSON as a schema error", async () => {
    const { rest } = client([response(200, "not json")]);
    expect(await rest.get("/x", { parse: parseNamed })).toMatchObject({ kind: "schema-error" });
  });

  it("reports a parser rejection as a schema error", async () => {
    const { rest } = client([response(200, "{\"other\":1}")]);
    expect(await rest.get("/x", { parse: parseNamed })).toMatchObject({ kind: "schema-error" });
  });
});

describe("GitHubRestClient.getPaginated", () => {
  it("follows Link rel=next and concatenates every page deterministically", async () => {
    const { rest, fake } = client([
      response(200, "[{\"name\":\"a\"}]", { Link: "<https://api.github.com/x?page=2>; rel=\"next\"" }),
      response(200, "[{\"name\":\"b\"},{\"name\":\"c\"}]"),
    ]);
    const result = await rest.getPaginated("/x", { parsePage: parseNamedPage });
    expect(result).toEqual({ kind: "ok", status: 200, value: [{ name: "a" }, { name: "b" }, { name: "c" }] });
    expect(fake.calls[1]?.url).toBe("https://api.github.com/x?page=2");
  });

  it("fails unavailable at the enumeration cap rather than truncating", async () => {
    const { rest } = client(
      [
        response(200, "[{\"name\":\"a\"}]", { Link: "<https://api.github.com/x?page=2>; rel=\"next\"" }),
        response(200, "[{\"name\":\"b\"}]", { Link: "<https://api.github.com/x?page=3>; rel=\"next\"" }),
      ],
      1,
    );
    expect(await rest.getPaginated("/x", { parsePage: parseNamedPage })).toEqual({
      kind: "unavailable",
      reason: "enumeration-cap",
    });
  });

  it("fails on a mid-enumeration HTTP error rather than returning a partial set", async () => {
    const { rest } = client([
      response(200, "[{\"name\":\"a\"}]", { Link: "<https://api.github.com/x?page=2>; rel=\"next\"" }),
      response(500, ""),
    ]);
    expect(await rest.getPaginated("/x", { parsePage: parseNamedPage })).toEqual({
      kind: "unavailable",
      reason: "retry-exhausted",
    });
  });
});

describe("GitHubRestClient.write", () => {
  it("returns a validated value on success", async () => {
    const { rest } = client([response(201, "{\"name\":\"comment\"}")]);
    expect(await rest.write("POST", "/x", { body: { a: 1 }, parse: parseNamed })).toEqual({
      kind: "ok",
      status: 201,
      value: { name: "comment" },
    });
  });

  it("reports a definitive HTTP rejection", async () => {
    const { rest } = client([response(422, "{\"message\":\"nope\"}")]);
    expect(await rest.write("POST", "/x", { parse: parseNamed })).toEqual({
      kind: "http-error",
      status: 422,
      message: "nope",
    });
  });

  it("reports a rate-limited write distinctly", async () => {
    const { rest } = client([response(429, "", { "Retry-After": "1" })]);
    expect(await rest.write("POST", "/x", { parse: parseNamed })).toEqual({ kind: "rate-limited" });
  });

  it("resolves an ambiguous write when reconcile finds the applied effect", async () => {
    const { rest } = client([networkError()]);
    const reconcile = (): Promise<ReadOutcome<Named | null>> =>
      Promise.resolve({ kind: "ok", status: 200, value: { name: "found" } });
    expect(await rest.write("POST", "/x", { parse: parseNamed, reconcile })).toEqual({
      kind: "ok",
      status: 200,
      value: { name: "found" },
    });
  });

  it("stays ambiguous when reconcile finds nothing", async () => {
    const { rest } = client([networkError()]);
    const reconcile = (): Promise<ReadOutcome<Named | null>> => Promise.resolve({ kind: "ok", status: 200, value: null });
    expect(await rest.write("POST", "/x", { parse: parseNamed, reconcile })).toEqual({
      kind: "ambiguous",
      reason: "network",
    });
  });

  it("stays ambiguous with no reconcile supplied", async () => {
    const { rest } = client([response(500, "")]);
    expect(await rest.write("POST", "/x", { parse: parseNamed })).toEqual({ kind: "ambiguous", reason: "server" });
  });

  it("keeps the token out of every write outcome", async () => {
    const { rest } = client([response(422, "{\"message\":\"nope\"}")]);
    const result = await rest.write("POST", "/x", { parse: parseNamed });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
