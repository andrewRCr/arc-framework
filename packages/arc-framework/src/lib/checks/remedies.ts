/** Work-preserving retry commands for declared check failures. */
import type { CheckRequest, CheckScope } from "./request.js";
import type { ResolvedCheckRequest } from "./resolve-request.js";

function scopeArguments(scope: CheckScope, base?: string): string[] {
  if (scope.kind === "range") {
    const from = base ?? scope.base;
    return ["--range", ...(from === undefined ? [] : [from])];
  }
  if (scope.kind === "paths") return ["--paths", ...scope.paths];
  return [`--${scope.kind}`];
}

function originalArguments(request: CheckRequest): string[] {
  const form = request.form;
  const args = form.kind === "gate" ? ["gate", form.gate]
    : form.kind === "run" ? ["run", ...form.ids]
    : form.kind === "new-head" ? ["new-head", "--from", form.from] : [form.kind];
  // Variadic paths remain last so the native parser cannot consume later flags.
  if (request.ci) args.push("--ci");
  if (request.force) args.push("--force");
  if (request.serial) args.push("--serial");
  if (request.scope) args.push(...scopeArguments(request.scope));
  return args;
}

function quote(argument: string): string {
  return /^[A-Za-z0-9_./:@=+-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;
}

/**
 * Name a retry that retains the request's selection and applies permitted fixes.
 * @param input - Failed check identity, request, coordinates, and whether widening supplied all file inputs
 * @returns A check command or the guarded Git operation
 */
export function checkRetryCommand(input: {
  id: string; request: CheckRequest; resolved: ResolvedCheckRequest; widenedFiles: boolean;
}): string {
  const { id, request, resolved, widenedFiles } = input;
  if (widenedFiles && request.form.kind === "pre-commit") return "git commit";
  const args = widenedFiles ? originalArguments(request) : ["run", id, ...scopeArguments(resolved.scope, resolved.base)];
  return ["arc", "check", ...args].map(quote).join(" ");
}
