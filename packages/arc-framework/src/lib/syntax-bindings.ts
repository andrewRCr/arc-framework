/** Module-local lexical declaration lookup over an existing TypeScript syntax tree. */
import ts from "typescript";

function scope(node: ts.Node, functionOnly = false): ts.Node {
  for (let current = node; ; current = current.parent) {
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) return current;
    if (!functionOnly && (ts.isBlock(current) || ts.isCatchClause(current) || ts.isCaseBlock(current)
      || ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current))) return current;
  }
}
function namedDeclaration(node: ts.Node): ts.Identifier | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)
    || ts.isFunctionExpression(node) || ts.isClassExpression(node)) return node.name;
  return undefined;
}

/**
 * Index lexical value declarations without following aliases or other modules.
 * @param source - Parsed module with parent links.
 * @returns Lookup of the nearest declaration for an identifier at its use site.
 */
export function syntaxBindingLookup(source: ts.SourceFile): (identifier: ts.Identifier) => ts.Node | undefined {
  const scopes = new Map<ts.Node, Map<string, ts.Node>>();
  const bind = (owner: ts.Node, name: ts.BindingName, declaration: ts.Node): void => {
    if (!ts.isIdentifier(name)) {
      for (const element of name.elements) if (!ts.isOmittedExpression(element)) bind(owner, element.name, declaration);
      return;
    }
    const bindings = scopes.get(owner) ?? new Map<string, ts.Node>();
    bindings.set(name.text, declaration);
    scopes.set(owner, bindings);
  };
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      const blockScoped = ts.isCatchClause(node.parent)
        || (ts.isVariableDeclarationList(node.parent) && Boolean(node.parent.flags & ts.NodeFlags.BlockScoped));
      bind(scope(node.parent, !blockScoped), node.name, node);
    } else if (ts.isParameter(node)) bind(node.parent, node.name, node);
    else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) {
      bind(source, node.name, node);
    } else if (ts.isImportClause(node) && node.name !== undefined) bind(source, node.name, node);
    else {
      const name = namedDeclaration(node);
      if (name !== undefined) bind(ts.isFunctionExpression(node) || ts.isClassExpression(node) ? node : scope(node.parent), name, node);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  return (identifier) => {
    for (let current: ts.Node = identifier; ; current = current.parent) {
      const declaration = scopes.get(current)?.get(identifier.text);
      if (declaration !== undefined || ts.isSourceFile(current)) return declaration;
    }
  };
}

function propertyName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (ts.isPropertyAccessExpression(parent) && parent.name === identifier)
    || (ts.isPropertyAssignment(parent) && parent.name === identifier)
    || (ts.isBindingElement(parent) && parent.propertyName === identifier)
    || ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent);
}
function declarationName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  return (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)
    || ts.isFunctionLike(parent) || ts.isClassLike(parent) || ts.isEnumDeclaration(parent)) && parent.name === identifier;
}

/**
 * Distinguish value references from declarations, property names and type syntax.
 * @param identifier - Identifier with parent links.
 * @returns Whether the identifier can consume a value binding.
 */
export function isSyntaxValueReference(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (propertyName(identifier) || declarationName(identifier)) return false;
  if (ts.isExportSpecifier(parent)) return !parent.isTypeOnly && !parent.parent.parent.isTypeOnly
    && (parent.propertyName ?? parent.name) === identifier;
  for (let current: ts.Node = parent; !ts.isSourceFile(current); current = current.parent) {
    if (ts.isTypeNode(current) || ts.isImportDeclaration(current)) return false;
  }
  return true;
}
