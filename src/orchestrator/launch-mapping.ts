// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Derives an executable Launch from a resolved server.json: which package or
// remote to start, and how. Pure orchestration logic over the standard's own
// types, same footing as runtime-mapping.ts and for the same reason (see
// docs/ARCHITECTURE.md's dependency rules) -- it lives here, not adapters/.
//
// Scope, grounded in real registry data rather than assumption (a 100-server
// sample of the live official registry, taken while designing this): only
// npm (-> npx) and pypi (-> uvx) packages are supported so far. Both share
// an identical `<runtime-bin> [runtimeArguments] <identifier>[@version]
// [packageArguments]` shape once a runtime bin is known, verified end-to-end
// against a real published npm package in launch-mapping.test.js.
//
// oci is deliberately NOT implemented here despite runtime-mapping.ts already
// mapping it to a "docker" runtime requirement: the sample showed an oci
// package's `identifier` already embeds its version as an image tag (e.g.
// "docker.io/foo/bar:0.1.0"), unlike npm/pypi where version is separate --
// and, more fundamentally, a container is isolated from the host environment
// by design, so a server's `environmentVariables` would need to become
// `-e NAME` docker-run flags rather than flow through the ordinary
// EnvironmentProvider env-var path this project already has. That is a real
// design question, not a detail, so it's tracked as its own follow-up
// (see #38's own PR/issue thread) rather than guessed at here.

import type { Launch, McpArgument, McpPackage, McpServerJson } from "@medullaflow/ribosome-schema";

/** registryType -> default runtime binary, used when a package sets no explicit runtimeHint. */
const DEFAULT_RUNTIME_BIN: Record<string, string> = {
  npm: "npx",
  pypi: "uvx",
};

function runtimeBinFor(pkg: McpPackage): string | undefined {
  return pkg.runtimeHint ?? DEFAULT_RUNTIME_BIN[pkg.registryType];
}

/**
 * Render one argument to its argv tokens. Throws when there is no literal
 * `value` to render (only a `valueHint`): ribosome does not yet collect
 * user-supplied argument values, and silently omitting a token here would
 * produce a Launch that looks valid but fails when actually run -- exactly
 * the "fails mid-execution, not at validation time" outcome this project
 * exists to prevent (see docs/ARCHITECTURE.md's opening framing).
 */
function renderArgument(arg: McpArgument): string[] {
  if (arg.value === undefined) {
    throw new Error(
      `argument${arg.name ? ` "${arg.name}"` : ""} has no literal value to launch with (only a valueHint) -- user-supplied argument values are not resolved yet`,
    );
  }
  return arg.type === "positional" || !arg.name ? [arg.value] : [arg.name, arg.value];
}

function packageCommand(bin: string, pkg: McpPackage): [string, ...string[]] {
  const target = pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier;
  const runtimeArgs = (pkg.runtimeArguments ?? []).flatMap(renderArgument);
  const packageArgs = (pkg.packageArguments ?? []).flatMap(renderArgument);
  return [bin, ...runtimeArgs, target, ...packageArgs];
}

/**
 * Pick a package or remote to launch and derive the standard's `Launch`
 * shape from it. Packages take precedence over remotes when a server
 * declares both -- provisioning a runtime and launching locally is
 * ribosome's whole niche (see docs/ARCHITECTURE.md) -- and among several
 * packages, the first one this adapter knows how to invoke wins (so e.g. an
 * oci package listed before an npm alternative doesn't block the one that's
 * actually launchable today). Falls back to the first remote whenever no
 * package resolves, including when packages exist but none are supported.
 */
export function deriveLaunch(server: McpServerJson): Launch {
  for (const pkg of server.packages ?? []) {
    const bin = runtimeBinFor(pkg);
    if (bin) return { transport: "stdio", command: packageCommand(bin, pkg) };
  }

  const remote = server.remotes?.[0];
  if (remote) return { transport: "http", url: remote.url };

  const packageTypes = [...new Set((server.packages ?? []).map((p) => p.registryType))];
  throw new Error(
    packageTypes.length > 0
      ? `server "${server.name}" only declares packages of unsupported registryType(s) (${packageTypes.join(", ")}) and no remotes`
      : `server "${server.name}" declares neither packages nor remotes -- nothing to launch`,
  );
}
