#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// The CLI entry point (#5): the seam between the pure orchestrator core
// (effects-free, testable against fakes -- see src/orchestrator/) and a
// user-facing process. Argument parsing, subcommand dispatch, human-readable
// error output (deliberately distinct from ResolutionError's internal
// aggregated-failure shape), and the exit-code contract the verification-tier
// issue (#13) will assert against.
//
// This is the `bun build --compile` target (see the "compile" script in
// package.json). Consuming ribosome as an npm library imports the
// orchestrator directly from src/index.ts and never touches this file.

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { SchemaValidationError, validateManifest } from "@medullaflow/ribosome-schema";
import packageJson from "../package.json";
import { FileMcpRegistry } from "../src/adapters/mcp-registry/file-registry";
import { OfficialMcpRegistry } from "../src/adapters/mcp-registry/official-registry";
import { MiseEnvironmentProvider } from "../src/adapters/mise/mise-environment-provider";
import { LOCKFILE_FILENAME, writeLockfile } from "../src/orchestrator/lockfile-writer";
import { Materializer, ResolutionError } from "../src/orchestrator/materializer";

const EXIT_SUCCESS = 0;
const EXIT_INVALID_MANIFEST = 1;
const EXIT_RESOLUTION_FAILURE = 2;
const EXIT_INTERNAL_ERROR = 3;

const HELP = `Usage: ribosome <command> [options]

Commands:
  resolve [manifest]   Resolve dependencies into ${LOCKFILE_FILENAME} (default manifest: ribosome.json)
  prune                Remove runtimes no longer referenced by any tracked project

Options:
  --cwd <dir>          Project root the manifest and lockfile are anchored to (default: cwd)
  --dry-run            prune: report what would be removed, without removing it
  -h, --help           Show this help message
  -v, --version        Show version number
`;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseArgs(argv: string[]): { cwd: string; dryRun: boolean; positional: string[] } {
  const args = [...argv];
  let cwd = process.cwd();
  let dryRun = false;
  const positional: string[] = [];
  while (args.length > 0) {
    const arg = args.shift() as string;
    if (arg === "--cwd") {
      const value = args.shift();
      if (!value) throw new Error("--cwd requires a value");
      cwd = resolvePath(value);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      positional.push(arg);
    }
  }
  return { cwd, dryRun, positional };
}

async function runResolve(manifestPath: string, cwd: string): Promise<number> {
  const absManifestPath = resolvePath(cwd, manifestPath);

  let raw: string;
  try {
    raw = await readFile(absManifestPath, "utf8");
  } catch (cause) {
    console.error(`error: cannot read manifest at "${absManifestPath}": ${describeError(cause)}`);
    return EXIT_INVALID_MANIFEST;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    console.error(`error: "${absManifestPath}" is not valid JSON: ${describeError(cause)}`);
    return EXIT_INVALID_MANIFEST;
  }

  let manifest: ReturnType<typeof validateManifest>;
  try {
    manifest = validateManifest(parsed);
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      console.error(`error: ${err.message}`);
      return EXIT_INVALID_MANIFEST;
    }
    throw err;
  }

  const materializer = new Materializer({
    environmentProvider: new MiseEnvironmentProvider(),
    registries: [new OfficialMcpRegistry(), new FileMcpRegistry()],
  });

  let lockfile: Awaited<ReturnType<typeof materializer.materialize>>;
  try {
    lockfile = await materializer.materialize(manifest, { cwd });
  } catch (err) {
    if (err instanceof ResolutionError) {
      console.error(`error: ${err.message}`);
      for (const failure of err.failures) {
        console.error(`  - ${failure.kind}:${failure.id}: ${failure.reason}`);
      }
      return EXIT_RESOLUTION_FAILURE;
    }
    throw err;
  }

  await writeLockfile(lockfile, cwd);
  console.log(
    `Resolved ${lockfile.mcpServers.length} MCP server(s) and ` +
      `${lockfile.runtimePool.length} runtime(s) into ${LOCKFILE_FILENAME}`,
  );
  return EXIT_SUCCESS;
}

async function runPrune(cwd: string, dryRun: boolean): Promise<number> {
  // Hardcoded to this one concrete provider, same as runResolve -- prune()
  // is optional on the EnvironmentProvider port for adapters with no native
  // mechanism, but MiseEnvironmentProvider always implements it.
  const provider = new MiseEnvironmentProvider();
  const result = await provider.prune({ cwd }, { dryRun });

  if (result.pruned.length === 0) {
    console.log("Nothing to prune.");
    return EXIT_SUCCESS;
  }

  console.log(`${dryRun ? "Would prune" : "Pruned"} ${result.pruned.length} runtime(s):`);
  for (const { tool, version } of result.pruned) {
    console.log(`  - ${tool}@${version}`);
  }
  return EXIT_SUCCESS;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return EXIT_SUCCESS;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    console.log(packageJson.version);
    return EXIT_SUCCESS;
  }

  const [command, ...rest] = argv;
  if (command !== "resolve" && command !== "prune") {
    console.error(`error: unknown command "${command}"\n`);
    console.error(HELP);
    return EXIT_INVALID_MANIFEST;
  }

  let cwd: string;
  let dryRun: boolean;
  let positional: string[];
  try {
    ({ cwd, dryRun, positional } = parseArgs(rest));
  } catch (err) {
    console.error(`error: ${describeError(err)}`);
    return EXIT_INVALID_MANIFEST;
  }

  if (command === "prune") {
    return runPrune(cwd, dryRun);
  }
  return runResolve(positional[0] ?? "ribosome.json", cwd);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`internal error: ${describeError(err)}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exitCode = EXIT_INTERNAL_ERROR;
  });
