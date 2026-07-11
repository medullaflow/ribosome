// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// The architecture fitness function (#29): mechanically enforces the import-
// graph rules docs/ARCHITECTURE.md states in prose ("Dependency rules",
// rules 1-3 below -- rule 4, about the lockfile's data shape rather than any
// import, is enforced separately by the schema's own `additionalProperties`
// and a behavioral test, see test/materializer.test.js).
//
// Uses the TypeScript compiler API (already a devDependency) to parse real
// import/re-export statements rather than regexing source text -- robust
// against the multi-line named-import lists this codebase actually uses
// (see src/index.ts).
//
// Deliberately generic over its root argument (not hardcoded to this repo's
// own path): test/architecture-fitness.test.js points it at synthetic
// fixture trees, not just the real src/, to prove each rule actually fires.

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const RULES = {
  PORTS_NO_ADAPTERS: 'Rule 1: "ports/" must not import from "adapters/"',
  ADAPTERS_NO_SIBLINGS: "Rule 1: an adapter must not import another adapter",
  ORCHESTRATOR_NO_ADAPTERS:
    'Rule 2: the orchestrator must not import "adapters/" directly -- only index.ts wires concrete adapters',
  NO_LOCAL_SCHEMA:
    "Rule 3: the JSON Schema is authoritative and lives in ribosome-schema, not here",
};

/** Walks a directory recursively, returning every .ts/.tsx file's absolute path. */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Classifies a path (POSIX-separated, relative to the source root) into an architectural layer. */
function classify(relPath) {
  const [first] = relPath.split("/");
  if (first === "ports") return "ports";
  if (first === "adapters") return "adapters";
  if (first === "orchestrator") return "orchestrator";
  if (relPath === "index.ts") return "root";
  return "other";
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/** Every import/re-export module specifier in a file, with its 1-based line number. */
function moduleSpecifiers(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const target = ts.ScriptTarget.ESNext ?? ts.ScriptTarget.Latest ?? 99;
  const sf = ts.createSourceFile(filePath, content, target, true, ts.ScriptKind.TS);
  const specs = [];
  for (const stmt of sf.statements) {
    const isEdge =
      ts.isImportDeclaration(stmt) || (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier);
    if (isEdge && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      specs.push({
        specifier: stmt.moduleSpecifier.text,
        line: sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1,
      });
    }
  }
  return specs;
}

/** Resolves a relative specifier to a root-relative POSIX path, or null for an external package. */
function resolveRelative(fromFile, specifier, root) {
  if (!specifier.startsWith(".")) return null;
  const targetAbs = path.resolve(path.dirname(fromFile), specifier);
  return toPosix(path.relative(root, targetAbs));
}

/** Rules 1-2: the import graph within `root` (this repo's src/ or a test fixture standing in for it). */
function checkImportGraph(root) {
  const violations = [];
  for (const file of collectTsFiles(root)) {
    const relFile = toPosix(path.relative(root, file));
    const layer = classify(relFile);
    for (const { specifier, line } of moduleSpecifiers(file)) {
      const targetRel = resolveRelative(file, specifier, root);
      if (targetRel === null) continue;
      const targetLayer = classify(targetRel);

      if (layer === "ports" && targetLayer === "adapters") {
        violations.push(violation(relFile, line, "PORTS_NO_ADAPTERS", specifier));
      }
      if (layer === "adapters" && targetLayer === "adapters") {
        violations.push(violation(relFile, line, "ADAPTERS_NO_SIBLINGS", specifier));
      }
      if (layer === "orchestrator" && targetLayer === "adapters") {
        violations.push(violation(relFile, line, "ORCHESTRATOR_NO_ADAPTERS", specifier));
      }
    }
  }
  return violations;
}

/** Rule 3: no local JSON Schema files anywhere in the repo -- the standard lives in ribosome-schema. */
function checkNoLocalSchema(repoRoot) {
  const violations = [];
  const skip = new Set(["node_modules", ".git", "dist"]);
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".schema.json")) {
        violations.push(violation(toPosix(path.relative(repoRoot, full)), 1, "NO_LOCAL_SCHEMA"));
      }
    }
  })(repoRoot);
  return violations;
}

function violation(file, line, rule, specifier) {
  return {
    file,
    line,
    rule,
    message: RULES[rule],
    detail: specifier ? `imports "${specifier}"` : undefined,
  };
}

/** Runs every mechanically-checkable rule. `repoRoot` defaults to srcRoot's parent (this repo's layout). */
function checkArchitecture(srcRoot, repoRoot = path.dirname(srcRoot)) {
  return [...checkImportGraph(srcRoot), ...checkNoLocalSchema(repoRoot)];
}

module.exports = { checkArchitecture, checkImportGraph, checkNoLocalSchema, RULES };
