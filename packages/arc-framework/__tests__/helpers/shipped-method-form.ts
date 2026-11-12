/** Compare a self-hosted method with its package source while tolerating only an extending project override. */

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/u;

/**
 * Return a project method as the package ships it: an `extend` override keeps the default doctrine, so its
 * frontmatter flags and `.override` body are reset to the shipped placeholder. Any other content is returned
 * unchanged, so a `replace` override or an edited default still fails a synchronization check.
 * @param content - The project copy of the method.
 * @param methodName - The method's file base name, which names its `.override` section.
 * @returns The content a synchronization check compares with the package source.
 */
export function shippedMethodForm(content: string, methodName: string): string {
  const frontmatter = FRONTMATTER.exec(content)?.[1];
  if (frontmatter === undefined) return content;
  const fields = frontmatter.split("\n");
  if (!fields.includes("override-active: true") || !fields.includes("override-mode: extend")) return content;
  const shippedFields = fields
    .filter((field) => field !== "override-mode: extend")
    .map((field) => (field === "override-active: true" ? "override-active: false" : field));
  const lines = content.replace(FRONTMATTER, `---\n${shippedFields.join("\n")}\n---\n`).split("\n");
  const start = lines.indexOf(`## ${methodName}.override`);
  if (start === -1) return content;
  let end = start + 1;
  while (end < lines.length && !(lines[end] ?? "").startsWith("## ") && lines[end] !== "---") end += 1;
  return [...lines.slice(0, start + 1), "", "[No override configured]", "", ...lines.slice(end)].join("\n");
}
