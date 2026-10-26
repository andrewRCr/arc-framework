/** Run-owned frozen explicit environment inputs, independent of execution placement. */
import type { EnvironmentInputDeclarations } from "./environment-declaration.js";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { captureEnvironmentFile, EnvironmentFileCaptureError, nodeEnvironmentCaptureIO,
  type EnvironmentCaptureIO } from "./environment-file.js";

/** A captured input's literal presence or frozen file descriptor. */
export type CapturedBinding =
  | { readonly kind: "value"; readonly state: "unset" }
  | { readonly kind: "value"; readonly state: "set"; readonly value: string }
  | { readonly kind: "file"; readonly state: "unset" | "empty" }
  | { readonly kind: "file"; readonly state: "file"; readonly path: string; readonly digest: string; readonly bytes: number };

/** Immutable captured bindings and their owned storage lifetime. */
export interface CapturedEnvironmentInputs {
  readonly bindings: Readonly<Record<string, CapturedBinding>>;
  readonly identity: string;
  dispose(): Promise<void>;
}

/** Rebind frozen inputs while retaining unrelated native/provider ambient policy. */
export function bindCapturedEnvironment(
  bindings: Readonly<Record<string, CapturedBinding>>, ambient: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const normalize = (name: string) => platform === "win32" ? name.toUpperCase() : name;
  const names = new Set(Object.keys(bindings).map(normalize));
  const inherited = Object.entries(ambient).filter(([name]) => !names.has(normalize(name)));
  const explicit = Object.entries(bindings).flatMap(([name, binding]): Array<[string, string]> => {
    const value = capturedBindingValue(binding);
    return value === undefined ? [] : [[name, value]];
  });
  return Object.fromEntries([...inherited, ...explicit]);
}

function capturedBindingValue(binding: CapturedBinding): string | undefined {
  if (binding.kind === "value") return binding.state === "set" ? binding.value : undefined;
  if (binding.state === "empty") return "";
  return binding.state === "file" ? binding.path : undefined;
}

/** Digest captured values and file bytes without transport or original file paths. */
export function capturedEnvironmentIdentity(bindings: Readonly<Record<string, CapturedBinding>>): string {
  const entries = Object.entries(bindings).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
    .map(([name, binding]) => ({ name, kind: binding.kind, state: binding.state,
      ...(binding.kind === "value" && binding.state === "set" ? { value: binding.value } : {}),
      ...(binding.kind === "file" && binding.state === "file" ? { digest: binding.digest, bytes: binding.bytes } : {}) }));
  return `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
}

interface CaptureContext { cwd: string; io: EnvironmentCaptureIO; directory?: string }

async function captureBinding(
  kind: "value" | "file", value: string | undefined, context: CaptureContext, index: number,
): Promise<CapturedBinding> {
  if (kind === "value") return value === undefined ? { kind, state: "unset" } : { kind, state: "set", value };
  if (value === undefined || value === "") return { kind, state: value === undefined ? "unset" : "empty" };
  context.directory ??= await context.io.createDirectory();
  const file = await captureEnvironmentFile(context.io, resolve(context.cwd, value), join(context.directory, `${index}.input`));
  return { kind, state: "file", ...file };
}

/** Freeze declared caller bindings before probes or execution. */
export async function captureEnvironmentInputs(
  inputs: EnvironmentInputDeclarations, cwd: string,
  options: { environment?: NodeJS.ProcessEnv; io?: EnvironmentCaptureIO } = {},
): Promise<CapturedEnvironmentInputs> {
  const environment = options.environment ?? process.env;
  const context: CaptureContext = { cwd, io: options.io ?? nodeEnvironmentCaptureIO };
  let currentName = "";
  const entries: Array<[string, CapturedBinding]> = [];
  try {
    for (const [name, kind] of Object.entries(inputs)) {
      currentName = name;
      const value = Object.hasOwn(environment, name) ? environment[name] : undefined;
      entries.push([name, await captureBinding(kind, value, context, entries.length)]);
    }
  } catch (cause) {
    const cleanup = context.directory === undefined ? undefined : await context.io.removeDirectory(context.directory)
      .then(() => "", () => " Temporary cleanup also failed.");
    const reason = cause instanceof EnvironmentFileCaptureError ? cause.message : "file could not be read or copied";
    throw new Error(`Could not capture environment_inputs binding ${currentName}: ${reason}; repair the file input and retry the check request.${cleanup ?? ""}`, { cause });
  }
  const bindings = Object.freeze(Object.fromEntries(entries.map(([name, binding]) => [name, Object.freeze(binding)])));
  let disposed = false;
  return { bindings, identity: capturedEnvironmentIdentity(bindings), dispose: async () => {
    if (disposed) return;
    if (context.directory !== undefined) await context.io.removeDirectory(context.directory).catch((cause: unknown) => {
      throw new Error("Could not dispose frozen environment inputs; repair temporary storage access and retry cleanup.", { cause });
    });
    disposed = true;
  } };
}
