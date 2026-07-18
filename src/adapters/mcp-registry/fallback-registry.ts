// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Adapter: wraps one McpRegistry-protocol adapter (almost always
// OfficialMcpRegistry) and retries its resolve() against an ordered list of
// mirror base URLs when the manifest's own declared URL is unreachable.
//
// This exists at the wiring level, not the manifest schema: `RegistrySource`
// (the normative shape in @medullaflow/ribosome-schema) carries exactly one
// `url`, and adding a second, array-typed field for "equivalent mirrors of
// this same source" would need a schema change in that separate, versioned
// repository (see docs/ARCHITECTURE.md's "Two repos, one standard"). This
// adapter gets the same outcome without one: it's the caller wiring up
// ribosome (the CLI's own default construction, or a library consumer) that
// decides the mirror list, not the manifest author -- appropriate, since
// mirrors of the *same* catalog are an operational/deployment concern, not
// something a manifest should need to know about. A manifest's
// `registries.sources` can still declare genuinely distinct catalogs
// (a private registry, a subregistry with different servers) -- this
// adapter does not, and should not, cascade across those, since a
// same-named server in an unrelated catalog isn't the same server.
//
// Deliberately does not read query.source.type at all -- it only rewrites
// query.source.url before delegating to the wrapped adapter, so it works
// for any McpRegistry-protocol adapter, not just OfficialMcpRegistry.

import type { McpServerJson } from "@medullaflow/ribosome-schema";
import {
  type McpRegistry,
  type RegistryQuery,
  RegistryUnreachableError,
} from "../../ports/mcp-registry";

/** CLI-level configuration: a comma-separated list of mirror base URLs, most to least preferred. */
export const REGISTRY_MIRRORS_ENV_VAR = "RIBOSOME_REGISTRY_MIRRORS";

/** Parses {@link REGISTRY_MIRRORS_ENV_VAR}; empty when unset, same as no mirrors configured. */
export function parseMirrorUrls(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[REGISTRY_MIRRORS_ENV_VAR];
  if (!raw) return [];
  return raw
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

export class FallbackMcpRegistry implements McpRegistry {
  readonly type: string;

  /**
   * @param adapter The protocol adapter that performs each attempt (e.g. `new OfficialMcpRegistry()`).
   * @param mirrorUrls Ordered base URLs tried, in order, after the manifest's own
   *   `source.url` fails -- each one assumed to mirror the same catalog as the first.
   */
  constructor(
    private readonly adapter: McpRegistry,
    private readonly mirrorUrls: string[],
  ) {
    this.type = adapter.type;
  }

  async resolve(query: RegistryQuery): Promise<McpServerJson> {
    const urls = [query.source.url, ...this.mirrorUrls];
    let lastError: RegistryUnreachableError | undefined;

    for (const url of urls) {
      try {
        return await this.adapter.resolve({ ...query, source: { ...query.source, url } });
      } catch (err) {
        // Only an unreachable registry justifies trying the next mirror --
        // ServerNotFoundError, InvalidServerDescriptorError, and
        // MissingRegistryCredentialError are the registry (or the query
        // itself) answering definitively, and falling through to a mirror
        // would risk silently resolving a same-named-but-different server
        // from a catalog that was never meant to substitute for this one.
        if (!(err instanceof RegistryUnreachableError)) throw err;
        lastError = err;
      }
    }

    throw lastError;
  }
}
