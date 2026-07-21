/**
 * Command-owned schema parsing and registry composition over the shared kernel.
 */

import { z } from "zod";

import {
  SchemaError,
  createKernelRegistry,
  type KernelRegistry,
} from "../kernel/index.js";
import {
  resolveInputValue,
  type InputResolution,
  type InputSource,
} from "./resolution.js";

/** One canonical command schema and any syntax aliases sharing its identity. */
export interface CommandInputRegistration<T extends z.ZodType = z.ZodType> {
  readonly commandPath: string;
  readonly aliases?: readonly string[];
  readonly schema: T;
  /** Explicit AST site-to-schema-field mapping owned by the command adapter. */
  readonly schemaFields?: Readonly<Record<string, string>>;
}

/** Kernel registry extended with canonical command-path lookup. */
export interface CommandInputRegistry extends KernelRegistry {
  getCommand(commandPath: string): z.ZodType | undefined;
}

/** Convert a canonical command path into its versioned schema identity. */
export function commandInputSchemaId(commandPath: string): string {
  const normalized = commandPath.trim().replaceAll(" ", "-");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized)) {
    throw new SchemaError(
      `Invalid command path for schema registration: ${JSON.stringify(commandPath)}`,
      "schema.registry.invalid-metadata",
    );
  }
  return `command-${normalized}-input`;
}

/** Parse raw Commander or prompt values through one command-owned schema. */
export function parseCommandInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
  source: InputSource,
): InputResolution<z.output<T>> {
  return resolveInputValue(schema, { kind: "value", value, source });
}

/**
 * Compose a fresh kernel registry with the supplied command-owned schemas.
 *
 * @param registrations - Canonical command registrations; opaque-only paths are omitted by callers.
 * @returns Isolated registry with alias-aware command lookup.
 */
export function createCommandInputRegistry(
  registrations: readonly CommandInputRegistration[] = [],
): CommandInputRegistry {
  const registry = createKernelRegistry();
  const paths = new Map<string, z.ZodType>();
  for (const registration of registrations) {
    if (paths.has(registration.commandPath)) {
      throw new SchemaError(
        `Duplicate command schema path: ${registration.commandPath}`,
        "schema.registry.duplicate-identity",
      );
    }
    registry.register(registration.schema, {
      id: commandInputSchemaId(registration.commandPath),
      version: 1,
      migrationPosture: "strict-current",
    });
    paths.set(registration.commandPath, registration.schema);
    for (const alias of registration.aliases ?? []) {
      if (paths.has(alias)) {
        throw new SchemaError(
          `Duplicate command schema alias: ${alias}`,
          "schema.registry.duplicate-identity",
        );
      }
      paths.set(alias, registration.schema);
    }
  }
  return {
    register: (schema, meta) => registry.register(schema, meta),
    get: (id) => registry.get(id),
    meta: (id) => registry.meta(id),
    ids: () => registry.ids(),
    toJSONSchema: (options) => registry.toJSONSchema(options),
    getCommand(commandPath): z.ZodType | undefined {
      return paths.get(commandPath);
    },
  };
}
