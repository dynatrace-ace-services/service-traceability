/**
 * DQL execute-and-poll helper.
 * Ported from IAM Sankey's executeDql() with minor generalization.
 *
 * The Grail Query API is asynchronous: a request returns a requestToken,
 * which must be polled until the query state is SUCCEEDED or FAILED.
 */

import { queryExecutionClient, type FilterSegment } from "@dynatrace-sdk/client-query";

const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 60;

export interface DqlResult<T = Record<string, unknown>> {
  records: T[];
  warnings?: string[];
}

export class DqlError extends Error {
  constructor(
    message: string,
    public readonly state?: string,
  ) {
    super(message);
    this.name = "DqlError";
  }
}

/**
 * Execute a DQL query and wait for results.
 *
 * @param query - DQL query string
 * @returns Parsed records from the query result
 * @throws DqlError on query failure or timeout
 */
export async function executeDql<T = Record<string, unknown>>(
  query: string,
  filterSegments?: FilterSegment[],
  options?: { maxResultRecords?: number; maxResultBytes?: number },
): Promise<DqlResult<T>> {
  const initial = await queryExecutionClient.queryExecute({
    body: {
      query,
      ...(filterSegments?.length ? { filterSegments } : {}),
      ...(options?.maxResultRecords !== undefined ? { maxResultRecords: options.maxResultRecords } : {}),
      ...(options?.maxResultBytes !== undefined ? { maxResultBytes: options.maxResultBytes } : {}),
    },
  });

  if (initial.state === "SUCCEEDED") {
    return extractResult<T>(initial);
  }

  const token = initial.requestToken;
  if (!token) {
    throw new DqlError("Query returned no requestToken and did not succeed immediately");
  }

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await queryExecutionClient.queryPoll({ requestToken: token });

    if (poll.state === "SUCCEEDED") {
      return extractResult<T>(poll);
    }

    if (
      poll.state === "FAILED" ||
      poll.state === "CANCELLED"
    ) {
      throw new DqlError(`DQL query ${poll.state}`, poll.state);
    }
    // RUNNING — keep polling
  }

  throw new DqlError("DQL query timed out after maximum polls", "TIMEOUT");
}

function extractResult<T>(response: {
  result?: { records?: unknown[] | null } | null;
  warnings?: string[] | null;
}): DqlResult<T> {
  return {
    records: (response.result?.records ?? []) as T[],
    warnings: response.warnings ?? [],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
