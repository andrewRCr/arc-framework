/** Read only the machine-local subprocess runner setting for eligible checks. */
import type { CheckDeclaration } from "../declaration.js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";

const RUNNER_KEY = "checks.runner";
const LiteralArgumentSchema = z.string().refine(value => !value.includes("\0"));
const RunnerArgvSchema = z.tuple([LiteralArgumentSchema.refine(value => value.length > 0)]).rest(LiteralArgumentSchema);
const YamlNodeKindSchema = z.object({ kind: z.string().nullable() });

/** Machine-file location and literal adapter executable/arguments. */
export interface MachineCheckRunnerConfiguration {
  file: string;
  argv: [string, ...string[]];
}

/** Operating-system home and machine-file read boundary. */
export interface MachineCheckRunnerConfigIO {
  home?: () => string;
  readFile?: (file: string) => Promise<string>;
}

/** Read the machine runner for a selected eligible check without consulting project configuration. */
export async function readMachineCheckRunner(
  check: Pick<CheckDeclaration["checks"][string], "runner">, io: MachineCheckRunnerConfigIO = {},
): Promise<MachineCheckRunnerConfiguration | undefined> {
  if (!check.runner) return undefined;
  const file = join((io.home ?? homedir)(), ".arc", "config.yml");
  let text: string;
  try {
    text = await (io.readFile ?? (path => readFile(path, "utf8")))(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw configurationError(file, "could not be read");
  }
  const document = parseMachineDocument(text, file);
  if (document === undefined) return undefined;
  if (!Object.hasOwn(document, RUNNER_KEY)) return undefined;
  const parsed = RunnerArgvSchema.safeParse(Reflect.get(document, RUNNER_KEY));
  if (!parsed.success) throw configurationError(file, "requires a nonempty literal argv with a nonempty executable and no NUL characters");
  const [executable, ...arguments_] = parsed.data;
  const location = isAbsolute(executable) || parse(executable).dir === "" ? executable : resolve(dirname(file), executable);
  return { file, argv: [location, ...arguments_] };
}

function parseMachineDocument(text: string, file: string): object | undefined {
  const root: { kind: string | null } = { kind: null };
  let document: unknown;
  const options = { filename: file, listener: (event: unknown, state: unknown) => {
    if (event === "close") root.kind = YamlNodeKindSchema.parse(state).kind;
  } };
  try {
    document = load(text, options);
  } catch { throw configurationError(file, "contains malformed YAML"); }
  // Empty documents and explicit null both decode to null; the root node kind distinguishes them.
  if (document === undefined || root.kind === null) return undefined;
  if (root.kind !== "mapping" || typeof document !== "object" || document === null) {
    throw configurationError(file, "requires a mapping document");
  }
  return document;
}

function configurationError(file: string, reason: string): Error {
  return new Error(`${file}: ${RUNNER_KEY} ${reason}; remove ${RUNNER_KEY} or repair the machine file and retry the check request.`);
}
