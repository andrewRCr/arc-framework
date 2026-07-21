/** Validated template-source to template-output path transformation. */

import { LayoutError } from "./errors.js";
import {
  TemplateOutputPathSchema,
  TemplateRelativePathSchema,
  type TemplateOutputPath,
} from "./schema.js";

/** Binding marker removed when it immediately precedes a final extension. */
export const TEMPLATE_BINDING_SUFFIX = ".template";

/** One validated template source and its transformed output path. */
export interface TemplateOutputBinding {
  templatePath: string;
  outputPath: TemplateOutputPath;
}

/**
 * Transform a validated package-template-relative path to its output-relative role.
 *
 * @param templatePath - Candidate path relative to the package template root
 * @returns Separately branded, validated template output path
 * @throws {@link LayoutError} when either side of the transform is unsafe
 */
export function resolveTemplateOutputPath(templatePath: string): TemplateOutputPath {
  const source = TemplateRelativePathSchema.safeParse(templatePath);
  if (!source.success) {
    throw new LayoutError("Invalid template source path", "layout.invalid-template-path", {
      cause: source.error,
    });
  }
  const transformed = source.data.replace(/\.template(\.[^/]+)$/u, "$1");
  const output = TemplateOutputPathSchema.safeParse(transformed);
  if (!output.success) {
    throw new LayoutError("Invalid transformed template output path", "layout.invalid-template-path", {
      cause: output.error,
    });
  }
  return output.data;
}

/**
 * Resolve a template file list while rejecting non-injective output transforms.
 *
 * @param templatePaths - Candidate paths relative to the package template root
 * @returns Validated source-to-output bindings in input order
 * @throws {@link LayoutError} when a path is unsafe or two sources map to one output
 */
export function resolveTemplateOutputBindings(
  templatePaths: readonly string[],
): TemplateOutputBinding[] {
  const sourcesByOutput = new Map<TemplateOutputPath, string>();
  return templatePaths.map((templatePath) => {
    const outputPath = resolveTemplateOutputPath(templatePath);
    const previousSource = sourcesByOutput.get(outputPath);
    if (previousSource !== undefined) {
      throw new LayoutError(
        `Template paths "${previousSource}" and "${templatePath}" map to the same output "${outputPath}"`,
        "layout.invalid-template-path",
      );
    }
    sourcesByOutput.set(outputPath, templatePath);
    return { templatePath, outputPath };
  });
}
