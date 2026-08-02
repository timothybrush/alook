#!/usr/bin/env node
/**
 * Shared TS-AST analyzer for the D1-armor guardrails (PR-C3②-AST, Blondie).
 *
 * ONE traverser, three consumers — point-level ratchet (`lint-d1-armor.mjs`),
 * swallow-class lint (`lint-d1-swallow.mjs`), and the C2-close census
 * (`census-d1.mjs`). They MUST share this module so the census's precision
 * equals the ratchet's — a backstop that judged points more coarsely than the
 * guard it backstops would carry the same blind spot (Aigneis's invariant). The
 * grep version could not do point-level: carriers wrap MULTI-LINE closures
 * (`withD1Retry(async () => { …queries.x(db)… })`), so a line-window "is a
 * carrier near this queries. line" test false-positives every armored point in
 * a closure as bare (proven on batch-A: permissions.ts:163/164/166 under one
 * withD1Retry, enrich's 6 reads under one). Only an AST ancestor walk answers
 * "is THIS execution point inside a carrier call's closure".
 *
 * Two primitives:
 *   execPoints(file)      → the D1 execution points in a file (a D1 op runs here)
 *   enclosingCarrier(node) → the carrier call this node sits inside, or null
 *
 * D1 EXECUTION POINT (first-arg-db predicate, Blondie): a call is a D1 exit iff
 *   - `queries.<ns>.<fn>(db, …)` — a query-layer call whose FIRST ARG is a db
 *     handle. First-arg-db is the DEFINITION of "touches D1", not a patch: a
 *     `queries.*`-namespaced helper that takes no db (hashCredential = pure
 *     SHA, doNameFromHash / toSummary = pure transforms) does not execute D1
 *     and is correctly NOT a point — no allowlist needed.
 *   - `db.batch(…)` / `await db.<verb>(…)` — direct handle execution.
 * The db handle is recognized by name: an arg / receiver whose leftmost
 * identifier is `db` (the codebase convention — every query fn takes `db`
 * first, every direct exec is on a `db` local). `createDb(…)`/`getDb(…)` only
 * OPEN a handle (not an exec point themselves); the exec is the later call.
 */
import ts from "typescript"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

// `lookupOr503` is a COMPOSED carrier — a thin, UNCONDITIONAL wrapper that does
// `withD1Retry(fn, RETRY_OPTS)` on the thunk it's handed (+ maps exhaustion to a
// 503), in `lib/middleware/community-agent-runner-auth.ts`. A read passed to it
// as `lookupOr503("step", () => queries.x(db))` IS armored, but withD1Retry
// lives in the helper body — not a lexical ancestor of the queries call (the
// call sits in the thunk, one frame away) — so `enclosingCarrier` can't see it
// and would false-POSITIVE the read as bare. Registering the helper NAME (exact
// match, NOT a "any thunk-taking helper" heuristic — that would false-NEGATIVE a
// helper that takes a thunk but forgets to wrap it) resolves it safely: the
// thunk's queries call is lexically inside the `lookupOr503(...)` arguments, so
// the existing arg-containment check matches. GUARD: this is safe ONLY while
// lookupOr503 stays an UNCONDITIONAL withD1Retry wrapper — if it ever branches to
// skip the wrap, drop it here and inline instead. It is the ONLY such helper
// repo-wide (Simone #281); a second one → build a general "composed-carrier"
// detector rather than growing this list by hand.
export const CARRIERS = ["withD1Retry", "readOrStale", "idempotentWrite", "nonIdempotentWriteAllowed", "lookupOr503"]

// `d1BareAllowed({ reason })` — a no-op marker wrapping a point that is
// DELIBERATELY left un-armored (Melly #260): a transient-tolerant read whose
// loss self-heals with no wrong-state (e.g. a typing fan-out read). Same spirit
// as `nonIdempotentWriteAllowed({reason})` — the decision + reason live IN THE
// CODE, machine-detectable, review-visible — never a side-list (a side-list is
// human memory = the blind spot this whole effort removes). `enclosingCarrier`
// reports it distinctly so the census buckets it as "intentionally-bare" (a
// documented, non-blocking exception) rather than "armored" or "UNATTRIBUTED".
export const BARE_MARKER = "d1BareAllowed"

/** Leftmost identifier of a (possibly nested) property-access / call chain. */
function rootIdentifier(node) {
  let cur = node
  while (cur) {
    if (ts.isIdentifier(cur)) return cur.text
    if (ts.isPropertyAccessExpression(cur)) cur = cur.expression
    else if (ts.isCallExpression(cur)) cur = cur.expression
    else if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression
    else return null
  }
  return null
}

/** Does this expression denote the D1 handle? (`db`, `this.db`, `ctx.db`, …) */
function isDbHandleExpr(arg) {
  if (!arg) return false
  if (ts.isIdentifier(arg)) return arg.text === "db"
  if (ts.isPropertyAccessExpression(arg)) return arg.name.text === "db"
  return false
}

/**
 * Classify a CallExpression as a D1 execution point, or null.
 *  - "queries" : `queries.<ns>.<fn>(db, …)`
 *  - "db"      : `db.<verb>(…)` (incl. `.batch(`) on the handle
 */
function classifyCall(call) {
  const callee = call.expression
  if (!ts.isPropertyAccessExpression(callee)) return null

  // queries.<ns>.<fn>(db, …) — root identifier is `queries`, first arg is db.
  if (rootIdentifier(callee) === "queries") {
    return isDbHandleExpr(call.arguments[0]) ? "queries" : null
  }

  // db.<verb>(…) — the call receiver is the db handle itself
  // (`db.batch(...)`, `await db.select()...`, `db.insert()...`).
  if (isDbHandleExpr(callee.expression)) return "db"

  return null
}

/**
 * Statement-BUILDERS are query fns that CONSTRUCT a Drizzle statement and
 * `return` it un-executed, for a caller to compose into a `db.batch([...])`
 * (or hand off via an `extraStatements` array). `bumpBotDailyActivityStatement`
 * is the live example: `send/route.ts:209` passes it into createMessage's armored
 * batch. The call `queries.communityBot.bumpBotDailyActivityStatement(db, …)`
 * classifies as a "queries" point (root=queries, first-arg=db), but it is NOT an
 * independent D1 exit — the exec UNIT is the batch that runs it, which census
 * either sees directly or reaches inside `db/queries/**` (excluded as the retry
 * unit). Retrying the builder-call would retry "build a statement", not a query.
 *
 * SOUNDNESS (Aigneis #282 — the predicate must never introduce a false-NEGATIVE
 * that hides a real bare exec). The structural "returns a `db` chain, no internal
 * await" property ALONE is NOT enough: a lazy READ query (`listMembers` =
 * `return db.select()…`, awaited by its caller) has the exact same shape as a
 * batch builder, and 77 query fns match it. Demoting those would hide real
 * executing reads — the precise failure mode to avoid. So THREE facts are ALL
 * required:
 *   (a) NAME: the fn is suffixed `*Statement` / `*Builder` — the codebase's
 *       DELIBERATE, documented marker that a fn returns an un-executed statement
 *       for batch composition (Simone/Melly's "statement-builder"). No `list*` /
 *       `get*` read carries it, so this can't over-match a read.
 *   (b) DEFINITION guard: the suffixed fn really is pure (no internal `await`,
 *       returns a `db`-rooted chain) — defends against a read mis-named with the
 *       suffix; such a fn would still execute and must stay a real point.
 *   (c) CALL-SITE: this call is NOT the operand of `await` — a non-awaited
 *       builder call is being COMPOSED (array element / argument) and runs later
 *       in a batch (a separately-visible exec point). An `await`ed builder call
 *       executes the thenable HERE and stays a real point.
 * SAFE failure direction: a future builder that DOESN'T follow the naming
 * convention isn't demoted → census reports it UNATTRIBUTED (over-report), never
 * hides it. Residual: no code does `const s = builder(); await s` (split
 * execute) — none exists; the batch convention forbids that shape anyway.
 */
let _builderCache = null
const BUILDER_SUFFIX = /(Statement|Builder)$/
function deriveStatementBuilders(root) {
  if (_builderCache) return _builderCache
  const names = new Set()
  const out = execFileSync("git", ["ls-files", "src/shared/src/db/queries"], {
    cwd: root, encoding: "utf8",
  })
  for (const rel of out.trim().split("\n").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const abs = `${root}/${rel}`
    const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.body &&
        BUILDER_SUFFIX.test(node.name.text) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        isPureStatementBuilder(node.body)
      ) {
        names.add(node.name.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  _builderCache = names
  return names
}

/** A function body that has NO `await` anywhere and `return`s a `db.*` chain. */
function isPureStatementBuilder(body) {
  let hasAwait = false
  let returnsDbChain = false
  const scan = (node) => {
    if (ts.isAwaitExpression(node)) hasAwait = true
    // Don't descend into nested function bodies — a builder may take/define a
    // closure; its own body's await/return is what matters. (Drizzle builders
    // don't nest fns today, but this keeps the check local and correct.)
    if (
      ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
    ) {
      if (node !== body.parent) return
    }
    if (ts.isReturnStatement(node) && node.expression && rootIdentifier(node.expression) === "db") {
      returnsDbChain = true
    }
    ts.forEachChild(node, scan)
  }
  scan(body)
  return returnsDbChain && !hasAwait
}

/** Is `call` the direct operand of an `await`? (`await queries.x.builder(db)`) */
function isAwaited(call) {
  return call.parent && ts.isAwaitExpression(call.parent)
}

/**
 * SELF-ARMORED COMPOSITE query fns (the 4th cross-boundary false-positive, Simone
 * #343). `useInvite` is a multi-statement query fn in `db/queries/**` that OWNS
 * its retry unit internally: `withD1Retry(() => db.batch([insert, uses+1]))` (my
 * ★2 #244 atomic-batch fix). The route calls `queries.communityInvite.useInvite(
 * db, …)`; census classifies that as a "queries" exec point (root=queries,
 * first-arg=db), but the armor is INSIDE useInvite's body — invisible to
 * `enclosingCarrier` (which only walks lexical ancestors of the call). Same
 * "armor in another frame" family as class-1/2, but the fix differs:
 *   - carrier-name registration (class-1) does NOT apply — that matches a call
 *     whose args CONTAIN the point; `useInvite(db)` isn't enclosing anything.
 *   - relocate (class-2) does NOT apply — you can't hoist the retry to the route;
 *     wrapping the whole fn re-runs the NON-atomic read→validate→batch sequence
 *     and reintroduces the exact ★2 under-count bug. The retry MUST stay on the
 *     internal atomic batch.
 * So the call is armored-at-definition. Detection is DEFINITION-derived (scan the
 * fn body), gated by the RED-LINE Aigneis #282/#345 insisted on to avoid a
 * false-NEGATIVE: judge the call armored ONLY IF **every WRITE in the fn body is
 * inside a carrier**. A body with an armored batch PLUS a bare write elsewhere is
 * NOT self-armored — that bare write is a real exec point and must be fixed
 * in-body, never hidden. (Bare READS in the body don't block: they're in the
 * `queries/**` leaf zone, benign, and separately out of census scope.) Only
 * `useInvite` qualifies today; a second one is caught automatically.
 */
let _selfArmoredCache = null
function deriveSelfArmoredQueryFns(root) {
  if (_selfArmoredCache) return _selfArmoredCache
  const names = new Set()
  const out = execFileSync("git", ["ls-files", "src/shared/src/db/queries"], {
    cwd: root, encoding: "utf8",
  })
  for (const rel of out.trim().split("\n").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const abs = `${root}/${rel}`
    const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
        node.name &&
        node.body &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        isFullyArmoredComposite(node.body)
      ) {
        names.add(node.name.getText(sf))
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  _selfArmoredCache = names
  return names
}

/**
 * A fn body with ≥1 carrier AND where EVERY `db.insert/update/delete` write sits
 * inside a carrier (`enclosingCarrier` non-null). Reads are ignored (benign, leaf
 * zone). Any bare write ⇒ false ⇒ the fn is NOT self-armored (red-line).
 */
function isFullyArmoredComposite(body) {
  let sawCarrier = false
  let bareWrite = false
  const scan = (node) => {
    if (ts.isCallExpression(node)) {
      const n = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : null
      if (n && CARRIERS.includes(n)) sawCarrier = true
      // A `db.<write>(…)` chain rooted on the handle.
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ["insert", "update", "delete"].includes(node.expression.name.text) &&
        rootIdentifier(node.expression.expression) === "db" &&
        !enclosingCarrier(node)
      ) {
        bareWrite = true
      }
    }
    ts.forEachChild(node, scan)
  }
  scan(body)
  return sawCarrier && !bareWrite
}

/** The carrier call `node` sits inside (as a descendant of its arguments), or null. */
export function enclosingCarrier(node) {
  let cur = node.parent
  while (cur) {
    if (ts.isCallExpression(cur)) {
      const name = ts.isIdentifier(cur.expression)
        ? cur.expression.text
        : ts.isPropertyAccessExpression(cur.expression)
          ? cur.expression.name.text
          : null
      if ((name && CARRIERS.includes(name)) || name === BARE_MARKER) {
        // Confirm `node` is within the carrier's ARGUMENTS (its wrapped
        // closure), not merely a later sibling that shares an ancestor.
        if (cur.arguments.some((a) => a.pos <= node.pos && node.end <= a.end)) {
          return name
        }
      }
    }
    cur = cur.parent
  }
  return null
}

/**
 * All D1 execution points in one file.
 * @returns {{file:string, line:number, kind:"queries"|"db", armored:string|null, text:string}[]}
 */
export function execPoints(relPath, root) {
  const abs = `${root}/${relPath}`
  const src = readFileSync(abs, "utf8")
  const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, /*setParentNodes*/ true)
  const points = []
  const builders = deriveStatementBuilders(root)
  const selfArmored = deriveSelfArmoredQueryFns(root)

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const kind = classifyCall(node)
      const calleeName =
        kind === "queries" && ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : null
      // Statement-builder composition (`queries.ns.buildX(db,…)` un-awaited) is
      // NOT an independent D1 exit — the exec unit is the batch that runs it.
      // See `deriveStatementBuilders`. Both facts required: the callee is a
      // derived pure builder AND this call isn't awaited (an awaited builder
      // call executes the thenable here and stays a real point).
      if (kind === "queries" && builders.has(calleeName) && !isAwaited(node)) {
        ts.forEachChild(node, visit)
        return
      }
      if (kind) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        // A self-armored composite query fn (`useInvite` — see
        // `deriveSelfArmoredQueryFns`) owns its retry internally; the call is a
        // real D1 exit but armored at definition, which `enclosingCarrier` (a
        // lexical-ancestor walk) can't see. Attribute the armor by definition.
        const armored =
          enclosingCarrier(node) ?? (selfArmored.has(calleeName) ? calleeName : null)
        points.push({
          file: relPath,
          line: line + 1, // 1-indexed
          kind,
          armored,
          text: node.getText(sf).split("\n")[0].slice(0, 80),
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return points
}

/** `file:line` key for a point (baseline entries use this form). */
export function pointKey(p) {
  return `${p.file}:${p.line}`
}
