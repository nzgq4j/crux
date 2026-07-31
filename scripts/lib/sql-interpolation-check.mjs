/**
 * Detect interpolation of runtime values into SQL statements.
 *
 * rules/database.md 20: no uncontrolled dynamic SQL.
 *
 * This replaces a line-oriented grep that matched any `${` following a SQL keyword.
 * That test could not distinguish a module constant from a request parameter, so it
 * reported the reviewed backend as unsafe while offering no additional protection —
 * a check that always fails is a check nobody reads.
 *
 * The rule here is inverted: an interpolation is a finding unless its safety can be
 * demonstrated mechanically from the syntax tree. Nothing is inferred from a
 * variable's name. The permitted forms are:
 *
 *   1. A string or numeric literal.
 *   2. A conditional whose every branch is itself permitted — an explicit literal
 *      allowlist, e.g. `sort === 'oldest' ? 'ASC' : 'DESC'`.
 *   3. A template literal whose every interpolation is itself permitted.
 *   4. An identifier bound by a `const` declaration in the same file whose
 *      initialiser is itself permitted. Applied transitively, with a cycle guard.
 *   5. A `const` array of strings, joined, where every value pushed into it is
 *      itself permitted. This is how a WHERE clause is assembled from fixed
 *      fragments that carry only bind placeholders.
 *   6. A numeric expression in bind-placeholder position — the literal text
 *      immediately before it ends with `$`, so the interpolation is forming `$1`,
 *      `$2` and so on. The static type must be `number`, which cannot carry a
 *      quote or a statement separator.
 *
 * Everything else is reported.
 *
 * Note what rule 6 does NOT permit: a number interpolated anywhere other than a
 * placeholder index. `LIMIT ${n}` is a finding even when `n` is typed `number`,
 * because a numeric type alone is an argument about the value, not about the way
 * the statement is built. Bind the value instead.
 */

import ts from 'typescript'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, dirname, resolve as resolvePath } from 'node:path'

/**
 * A template literal is treated as SQL when its fixed text contains a statement
 * keyword at a word boundary.
 *
 * The boundary matters. `SUMMARY_SELECT` does not match, because `_` is a word
 * character, and neither does a lowercase PostgREST query string such as
 * `?select=`. Those produced false findings under the previous check.
 */
const SQL_KEYWORD = /\b(SELECT|INSERT|UPDATE|DELETE)\b/

export function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectSourceFiles(full, out)
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full)
  }
  return out
}

/** Is this declaration a `const`? `let` and `var` can be reassigned. */
function isConstDeclaration(decl) {
  const list = decl.parent
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0
}

/** Find every `const` binding of `name` in the file, by identifier text. */
function findConstDeclarations(sourceFile, name) {
  const found = []
  const walk = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      isConstDeclaration(node)
    ) {
      found.push(node)
    }
    ts.forEachChild(node, walk)
  }
  walk(sourceFile)
  return found
}

/**
 * Where a named import came from, if `name` is imported in this file.
 *
 * Only relative specifiers are followed. A bare specifier is a package, whose
 * contents are outside the reviewed tree, so an identifier imported from one is
 * never treated as permitted.
 */
function findImportSource(sourceFile, name) {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const clause = stmt.importClause
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue
    for (const element of clause.namedBindings.elements) {
      if (element.name.text !== name) continue
      const specifier = stmt.moduleSpecifier
      if (!ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) return null
      return {
        specifier: specifier.text,
        exportedName: (element.propertyName ?? element.name).text,
      }
    }
  }
  return null
}

/** Resolve a relative module specifier to a file already in the program. */
function resolveModuleFile(fromFile, specifier) {
  const base = resolvePath(dirname(fromFile), specifier)
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Every `name.push(arg)` argument anywhere in the file. */
function findPushArguments(sourceFile, name) {
  const args = []
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'push' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === name
    ) {
      args.push(...node.arguments)
    }
    ts.forEachChild(node, walk)
  }
  walk(sourceFile)
  return args
}

/**
 * Decide whether one interpolated expression is provably safe.
 *
 * `placeholderPosition` is true when the fixed text immediately preceding this
 * interpolation ends with `$`.
 */
function classify(node, ctx, placeholderPosition, seen = new Set()) {
  const { sourceFile, checker } = ctx

  // 1. Literals.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { safe: true, reason: 'string literal' }
  }
  if (ts.isNumericLiteral(node)) {
    return { safe: true, reason: 'numeric literal' }
  }

  // Parentheses and `as const` style assertions are transparent.
  if (ts.isParenthesizedExpression(node)) {
    return classify(node.expression, ctx, placeholderPosition, seen)
  }

  // 2. Literal allowlist expressed as a conditional.
  if (ts.isConditionalExpression(node)) {
    const a = classify(node.whenTrue, ctx, placeholderPosition, seen)
    const b = classify(node.whenFalse, ctx, placeholderPosition, seen)
    return a.safe && b.safe
      ? { safe: true, reason: 'conditional over permitted branches' }
      : { safe: false, reason: 'conditional with a branch that is not permitted' }
  }

  // 3. Nested template literal. Placeholder position is recomputed from this
  //    template's own text — the marker is the `$` immediately preceding the
  //    interpolation, so it lives in the part before it, never after.
  if (ts.isTemplateExpression(node)) {
    let preceding = node.head.text
    for (const span of node.templateSpans) {
      const r = classify(span.expression, ctx, /\$$/.test(preceding), seen)
      if (!r.safe) return { safe: false, reason: `nested template: ${r.reason}` }
      preceding = span.literal.text
    }
    return { safe: true, reason: 'nested template of permitted parts' }
  }

  // 5. `const fragments: string[] = []` joined, where every pushed value is permitted.
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'join' &&
    ts.isIdentifier(node.expression.expression)
  ) {
    const arrayName = node.expression.expression.text
    const separatorOk = node.arguments.every((a) => classify(a, ctx, false, seen).safe)
    const decls = findConstDeclarations(sourceFile, arrayName)
    if (decls.length === 1 && separatorOk) {
      const pushed = findPushArguments(sourceFile, arrayName)
      const allSafe = pushed.every((a) => classify(a, ctx, false, seen).safe)
      if (allSafe) {
        return { safe: true, reason: `join over const array '${arrayName}' of permitted fragments` }
      }
      return { safe: false, reason: `array '${arrayName}' receives a value that is not permitted` }
    }
    return { safe: false, reason: `join over '${arrayName}', which is not a single const array` }
  }

  // 6. Bind-placeholder index. A number cannot carry a quote or a separator, but it
  //    is permitted only here — see the note at the top of this file.
  if (placeholderPosition && checker) {
    const type = checker.getTypeAtLocation(node)
    if (type.flags & ts.TypeFlags.NumberLike) {
      return { safe: true, reason: 'numeric bind-placeholder index' }
    }
  }

  // 4. An identifier bound by a const whose initialiser is permitted. The const may
  //    live in this file or be imported from another file in the reviewed tree.
  if (ts.isIdentifier(node)) {
    const key = `${sourceFile.fileName}#${node.text}`
    if (seen.has(key)) {
      return { safe: false, reason: `cyclic definition of '${node.text}'` }
    }
    const next = new Set(seen)
    next.add(key)

    const decls = findConstDeclarations(sourceFile, node.text)

    if (decls.length === 0) {
      const imported = findImportSource(sourceFile, node.text)
      if (!imported) {
        return { safe: false, reason: `'${node.text}' is not a const declared in this file` }
      }
      const target = resolveModuleFile(sourceFile.fileName, imported.specifier)
      const targetFile = target ? ctx.program.getSourceFile(target) : null
      if (!targetFile) {
        return {
          safe: false,
          reason: `'${node.text}' is imported from '${imported.specifier}', which is outside the reviewed tree`,
        }
      }
      const targetDecls = findConstDeclarations(targetFile, imported.exportedName)
      if (targetDecls.length !== 1 || !targetDecls[0].initializer) {
        return {
          safe: false,
          reason: `'${imported.exportedName}' is not a single initialised const in '${imported.specifier}'`,
        }
      }
      const r = classify(
        targetDecls[0].initializer,
        { ...ctx, sourceFile: targetFile },
        placeholderPosition,
        next,
      )
      return r.safe
        ? { safe: true, reason: `imported const '${node.text}' from '${imported.specifier}' (${r.reason})` }
        : { safe: false, reason: `imported const '${node.text}' is not permitted: ${r.reason}` }
    }

    if (decls.length > 1) {
      return { safe: false, reason: `'${node.text}' has more than one const declaration` }
    }
    const init = decls[0].initializer
    if (!init) return { safe: false, reason: `'${node.text}' has no initialiser` }
    const r = classify(init, ctx, placeholderPosition, next)
    return r.safe
      ? { safe: true, reason: `const '${node.text}' (${r.reason})` }
      : { safe: false, reason: `const '${node.text}' is not permitted: ${r.reason}` }
  }

  return { safe: false, reason: `${ts.SyntaxKind[node.kind]} cannot be shown safe` }
}

/**
 * Analyse the given files.
 *
 * Returns a list of findings: { file, line, column, text, reason }.
 */
export function analyze(fileNames) {
  const program = ts.createProgram(fileNames, {
    allowJs: false,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
  })
  const checker = program.getTypeChecker()
  const findings = []

  for (const fileName of fileNames) {
    const sourceFile = program.getSourceFile(fileName)
    if (!sourceFile) continue
    const ctx = { sourceFile, checker, program }

    const walk = (node) => {
      if (ts.isTemplateExpression(node)) {
        const fixedText = node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ')
        if (SQL_KEYWORD.test(fixedText)) {
          let precedingText = node.head.text
          for (const span of node.templateSpans) {
            const placeholder = /\$$/.test(precedingText)
            const result = classify(span.expression, ctx, placeholder)
            if (!result.safe) {
              const pos = sourceFile.getLineAndCharacterOfPosition(span.expression.getStart(sourceFile))
              findings.push({
                file: fileName,
                line: pos.line + 1,
                column: pos.character + 1,
                text: span.expression.getText(sourceFile),
                reason: result.reason,
              })
            }
            precedingText = span.literal.text
          }
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(sourceFile)
  }

  return findings
}

// --- CLI ------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    console.error('usage: sql-interpolation-check.mjs <dir> [dir...]')
    process.exit(2)
  }
  const files = dirs.flatMap((d) => collectSourceFiles(d))
  const findings = analyze(files)

  if (findings.length > 0) {
    // Diagnostics go to stderr: this is a failure report, and the conformance script
    // captures both streams.
    for (const f of findings) {
      console.error(`${f.file}:${f.line}:${f.column}  ${f.text}`)
      console.error(`    ${f.reason}`)
    }
    process.exit(1)
  }
  process.exit(0)
}
