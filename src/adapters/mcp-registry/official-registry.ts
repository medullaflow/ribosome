// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Adapter: the official MCP Registry API (registry.modelcontextprotocol.io) and
// any subregistry speaking the same protocol (GitHub, Microsoft, ...). This is
// one of the only two places in ribosome allowed to know a concrete MCP registry
// exists (the other being any sibling adapter).
//
// Deliberately a thin GET + validate, not a generated client: the only endpoint
// this adapter needs is GET /v0.1/servers/{name}/versions/{version}, and its
// response envelope is 3 fields (`server`, `_meta`) whose interesting part
// (`server`) is already the vendored, runtime-validated McpServerJson shape.
// Standing up an OpenAPI-vendor-and-codegen pipeline (most of that spec is
// auth/publish/admin endpoints this read-only adapter never touches) for a
// 3-field envelope would be disproportionate — this mirrors how McpServerJson
// itself is hand-typed in ribosome-schema, not generated.

import type { McpServerJson } from "@medullaflow/ribosome-schema";
import { checkMcpServerJson } from "@medullaflow/ribosome-schema";
import {
  InvalidServerDescriptorError,
  type McpRegistry,
  MissingRegistryCredentialError,
  type RegistryQuery,
  RegistryUnreachableError,
  ServerNotFoundError,
} from "../../ports/mcp-registry";

// 20s/1000ms (D51), raised from the original 10s/500ms (D47): observed
// directly (2026-07-14, PR #104's CI) that the live registry can enter a
// sustained degraded period, not just brief blips, answering with a real
// 200 but consistently taking ~12-13s to do it -- comfortably past the old
// 10s per-attempt budget, so every attempt aborted via AbortSignal.timeout
// before a healthy-but-slow response ever arrived, defeating the retry
// entirely (retrying a request that's timing out on latency, not failing,
// just repeats the same timeout). 20s leaves real margin above that
// observed latency rather than merely matching it.
const RESOLVE_TIMEOUT_MS = 20_000;
// 3 attempts, 1000ms/2000ms between them (RETRY_BACKOFF_MS * attempt).
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1_000;

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a connection failure/timeout or a 5xx response -- never a 4xx or a
 * resolved 404, which are the registry answering definitively, not a
 * network problem retrying could fix.
 */
async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS) });
    } catch (cause) {
      if (attempt >= MAX_ATTEMPTS) throw cause;
      await sleep(RETRY_BACKOFF_MS * attempt);
      continue;
    }
    if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_BACKOFF_MS * attempt);
      continue;
    }
    return response;
  }
}

/** The registry's success envelope. `_meta` (registry-specific bookkeeping) is unused here. */
interface ServerEnvelope {
  server: unknown;
}

/** The registry's RFC 7807-shaped error envelope, read opportunistically for a better message. */
interface ErrorEnvelope {
  detail?: string;
}

function resolveUrl(query: RegistryQuery): string {
  const base = query.source.url.replace(/\/+$/, "");
  const name = encodeURIComponent(query.name);
  const version = encodeURIComponent(query.version ?? "latest");
  return `${base}/v0.1/servers/${name}/versions/${version}`;
}

async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as ErrorEnvelope;
    return body.detail;
  } catch {
    return undefined;
  }
}

/**
 * Builds the headers `source.auth` declares, reading each value from its
 * named environment variable. Checked up front, before any request is sent —
 * a misconfigured/missing credential is a caller-config problem, not a
 * network failure, and sending the request anyway would only trade a clear
 * error for a confusing 401 from the registry.
 */
function authHeaders(query: RegistryQuery): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const { header, envVar } of query.source.auth ?? []) {
    const value = process.env[envVar];
    if (value === undefined) {
      throw new MissingRegistryCredentialError(query, header, envVar);
    }
    headers[header] = value;
  }
  return headers;
}

export class OfficialMcpRegistry implements McpRegistry {
  readonly type = "mcp-registry-v1";

  async resolve(query: RegistryQuery): Promise<McpServerJson> {
    const headers = authHeaders(query);

    let response: Response;
    try {
      response = await fetchWithRetry(resolveUrl(query), headers);
    } catch (cause) {
      throw new RegistryUnreachableError(query, cause);
    }

    if (response.status === 404) {
      throw new ServerNotFoundError(query);
    }
    if (!response.ok) {
      const detail = await readDetail(response);
      throw new RegistryUnreachableError(
        query,
        new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`),
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new InvalidServerDescriptorError(query, [
        `response body is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      ]);
    }

    const envelope = body as Partial<ServerEnvelope> | null;
    if (!envelope || typeof envelope !== "object" || !("server" in envelope)) {
      throw new InvalidServerDescriptorError(query, ['response is missing a "server" field']);
    }

    const { valid, errors } = checkMcpServerJson(envelope.server);
    if (!valid) {
      throw new InvalidServerDescriptorError(query, errors);
    }
    return envelope.server as McpServerJson;
  }
}
