/** Validated template-source to template-output path transformation. */

import { LayoutError } from "./errors.js";
import {
  TemplateOutputPathSchema,
  TemplateRelativePathSchema,
  type TemplateOutputPath,
} from "./schema.js";

/** Binding marker removed when it immediately precedes a final extension. */
export const TEMPLATE_BINDING_SUFFIX = ".template";

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
