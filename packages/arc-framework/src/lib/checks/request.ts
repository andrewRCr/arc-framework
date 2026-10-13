/** Typed forms and scopes for repository check requests. */
export type CheckGate = "commit" | "push" | "merge";
export type CheckScope = { kind: "staged" | "changed" | "all" }
  | { kind: "range"; base?: string } | { kind: "paths"; paths: string[] };
export type CheckForm = { kind: "increment" | "pre-commit" | "segment" }
  | { kind: "gate"; gate: CheckGate } | { kind: "run"; ids: string[] }
  | { kind: "new-head"; from: string }
  | { kind: "pre-push"; ref: string; tip: string; old?: string; remote?: string; url?: string };
/** A validated command request before repository coordinates resolve. */
export interface CheckRequest {
  form: CheckForm;
  scope?: CheckScope;
  force?: boolean;
  dryRun?: boolean;
  serial?: boolean;
  ci?: boolean;
  indexFile?: string;
  baseBranch?: string;
  skip?: string[];
  hookFixesFail?: boolean;
}
/**
 * Derive the declared default scope of a request.
 * @param request - Validated form and optional explicit scope
 * @returns The one scope defining its checked tree and change
 */
export function requestScope(request: CheckRequest): CheckScope {
  if (request.scope !== undefined) return request.scope;
  const form = request.form;
  if (form.kind === "pre-commit") return { kind: "staged" };
  if (form.kind === "pre-push") return { kind: "range", ...(form.old && !/^0+$/u.test(form.old) ? { base: form.old } : {}) };
  if (form.kind === "new-head") return { kind: "range", base: form.from };
  if (form.kind === "segment") return { kind: "range" };
  if (form.kind === "run" || (form.kind === "gate" && form.gate === "merge")) return { kind: "all" };
  return { kind: "changed" };
}

/**
 * Identify forms whose policies belong to a person's Git hook invocation.
 * @param form - Validated check form
 * @returns Whether hook-only controls apply
 */
export function isCheckHookForm(form: CheckForm): boolean {
  return form.kind === "pre-commit" || form.kind === "pre-push";
}
