/** Resolve recorded effective endpoints without applying Git's URL rewrites a second time. */
import { rememberRefLookup } from "./operation-scope.js";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { RefBackendContext } from "./context.js";

type TransportOperation = "fetch" | "push";

/** Local configuration cannot currently express the recorded receiver; no network attempt was made. */
export class EffectiveTransportError extends Error {
  constructor(endpoint: string, operation: TransportOperation, reason = "cannot be reached without another URL rewrite") {
    super(`The recorded ${operation} endpoint ${JSON.stringify(endpoint)} ${reason}. Repair the repository's URL configuration to restore this endpoint, then retry.`);
  }
}

/** Read every publication destination, retaining Git's configured fetch spelling separately at the caller. */
export async function readRemoteTransports(context: RefBackendContext, name: string): Promise<{ fetchUrl: string; pushUrls: string[] }> {
  return rememberRefLookup(context, readRemoteTransports, [name], async () => {
    await validateNamedTransport(context, name);
    const options = { cwd: context.checkoutRoot, objectAccess: "local-only" as const, preserveOutput: true };
    const fetchUrl = lines((await context.exec("git", ["remote", "get-url", name], options)).stdout)[0] ?? "";
    const pushUrls = lines((await context.exec("git", ["remote", "get-url", "--push", "--all", name], options)).stdout);
    return { fetchUrl, pushUrls };
  });
}

/** Read the selected named transport without trimming URL bytes or validating an unrelated read-only push setting. */
export async function readNamedTransport(context: RefBackendContext, name: string, operation: TransportOperation): Promise<string[]> {
  return rememberRefLookup(context, readNamedTransport, [name, operation], async () => {
    await validateNamedTransport(context, name, operation);
    return lines((await context.exec("git", ["remote", "get-url", ...operation === "push" ? ["--push", "--all"] : [], name],
      { cwd: context.checkoutRoot, objectAccess: "local-only", preserveOutput: true })).stdout);
  });
}

/** Ask Git what a literal operand resolves to, without contacting any receiver or suppressing its configuration. */
export async function resolveLiteralTransport(context: RefBackendContext, raw: string, operation: TransportOperation): Promise<string[]> {
  return resolveLiteral(context, raw, operation);
}

/** Finite one-step inverse spellings; Git, rather than a parallel evaluator, decides which ones actually work. */
export async function effectiveTransportCandidates(context: RefBackendContext, endpoint: string, operation: TransportOperation): Promise<string[]> {
  requireSingleLine(endpoint, operation);
  const candidates = new Set([endpoint]);
  for (const { base, value, pushOnly } of await urlRewrites(context)) {
    if (operation === "fetch" && pushOnly || !endpoint.startsWith(base)) continue;
    requireSingleLine(value, operation);
    candidates.add(value + endpoint.slice(base.length));
  }
  return [...candidates];
}

/** Select one proven literal spelling before contact; a later hook or authentication refusal never tries another. */
export async function selectLiteralTransport(context: RefBackendContext, endpoint: string, operation: TransportOperation): Promise<string> {
  const names = await readRemoteNames(context);
  for (const raw of await effectiveTransportCandidates(context, endpoint, operation)) {
    // A transport operand equal to a named remote has that remote's authority and settings, not literal URL semantics.
    if (names.includes(raw)) continue;
    const resolved = await resolveLiteral(context, raw, operation);
    if (resolved.length === 1 && resolved[0] === endpoint) return raw;
  }
  throw new EffectiveTransportError(endpoint, operation);
}

async function resolveLiteral(context: RefBackendContext, raw: string, operation: TransportOperation): Promise<string[]> {
  return rememberRefLookup(context, resolveLiteral, [raw, operation], async () => {
    requireSingleLine(raw, operation);
    for (const { base, value, pushOnly } of await urlRewrites(context)) {
      if (raw.startsWith(value) && (!pushOnly || operation === "push")) requireSingleLine(base, operation);
    }
    const options = { cwd: context.checkoutRoot, objectAccess: "local-only" as const, preserveOutput: true };
    if (operation === "fetch") return lines((await context.exec("git", ["ls-remote", "--get-url", "--", raw], options)).stdout);
    // show -n resolves the actual literal operand without querying its receiver, changing configuration, or
    // inventing a named remote that could alter conditional includes. It applies pushInsteadOf as push does.
    const output = (await context.exec("git", ["remote", "show", "-n", "--", raw], { ...options, diagnosticLocale: "stable", preserveOutput: true })).stdout;
    const prefix = "  Push  URL: ";
    return output.split(/\r?\n/u).filter(row => row.startsWith(prefix)).map(row => row.slice(prefix.length));
  });
}

function requireSingleLine(value: string, operation: TransportOperation): void {
  if (/[\r\n]/u.test(value)) throw new EffectiveTransportError(value, operation, "contains a line break that cannot be observed as one URL");
}

async function validateNamedTransport(context: RefBackendContext, name: string, operation: TransportOperation = "push"): Promise<void> {
  const rewrites = await urlRewrites(context);
  for (const setting of operation === "fetch" ? ["url"] : ["url", "pushurl"]) {
    const values = await configOutput(context, ["--null", "--get-all", `remote.${name}.${setting}`]);
    for (const raw of values.split("\0").filter(Boolean)) {
      requireSingleLine(raw, setting === "url" ? "fetch" : "push");
      for (const { base, value, pushOnly } of rewrites) if (raw.startsWith(value) && (!pushOnly || operation === "push")) requireSingleLine(base, operation);
    }
  }
}

async function urlRewrites(context: RefBackendContext): Promise<{ base: string; value: string; pushOnly: boolean }[]> {
  const output = await configOutput(context, ["--null", "--get-regexp", "^url\\..*\\.(insteadof|pushinsteadof)$"]);
  return output.split("\0").filter(Boolean).map(row => {
    const boundary = row.indexOf("\n"), key = row.slice(0, boundary);
    return { base: key.slice("url.".length, key.lastIndexOf(".")), value: row.slice(boundary + 1), pushOnly: key.endsWith(".pushinsteadof") };
  });
}

async function configOutput(context: RefBackendContext, args: string[]): Promise<string> {
  return rememberRefLookup(context, configOutput, [args], async () => {
    try { return (await context.exec("git", ["config", ...args], { cwd: context.checkoutRoot, objectAccess: "local-only", preserveOutput: true })).stdout; }
    catch (error) { if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return ""; throw error; }
  });
}

function lines(value: string): string[] { return value.split(/\r?\n/u).filter(Boolean); }

async function readRemoteNames(context: RefBackendContext): Promise<string[]> {
  return rememberRefLookup(context, readRemoteNames, [], async () =>
    lines((await context.exec("git", ["remote"], { cwd: context.checkoutRoot, objectAccess: "local-only" })).stdout));
}
