// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Adapter: the official MCP Registry API (registry.modelcontextprotocol.io) and
// any subregistry speaking the same protocol (GitHub, Microsoft, ...). This is
// one of the only two places in ribosome allowed to know a concrete MCP registry
// exists (the other being any sibling adapter).
//
// Interface shape only for now: resolve() is a stub. Real work is an HTTP GET to
// the source URL and mapping the response to a server.json document.

import type { McpRegistry, RegistryQuery } from "../../ports/mcp-registry";
import type { McpServerJson } from "@medullaflow/ribosome-schema";

export class OfficialMcpRegistry implements McpRegistry {
  readonly type = "mcp-registry-v1";

  async resolve(query: RegistryQuery): Promise<McpServerJson> {
    void query;
    throw new Error(
      "not implemented: HTTP lookup against RegistrySource.url, mapped to a server.json",
    );
  }
}
