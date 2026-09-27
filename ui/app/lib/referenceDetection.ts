/**
 * Centralized recursive reference detection for Dynatrace Gen 3 configurations.
 * Ported and extended from scanner-script-python logic.
 *
 * Strategy: serialize the cleaned JSON to a string once, then apply all
 * detection patterns against that string. This naturally covers every nested
 * object, array, DQL expression, variable block, filter, segment reference,
 * and workflow action — no field-specific traversal needed.
 */

/** Regex matching a Gen3 service entity ID (SERVICE- followed by 16 hex chars). */
const GEN3_SERVICE_ID_RE = /\bSERVICE-[0-9A-Fa-f]{16}\b/g;

/** Regex matching a classic service entity ID (any Dynatrace entity ID pattern for services). */
const CLASSIC_SERVICE_ID_RE = /\bSERVICE_METHOD-[0-9A-Fa-f]{16}\b/g;

export interface DetectionResult {
  serviceIds: Set<string>;
  keyRequestIds: Set<string>;
}

/**
 * Strip cached query result subtrees from a config body before scanning.
 * Notebooks and dashboards embed last-executed query results which can contain
 * arbitrary entity IDs unrelated to the config's own references.
 *
 * Keys removed: "state.result", "result", "queryResult", "cachedResult"
 * (applied recursively to all objects in the tree).
 */
export function stripCachedResults(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(stripCachedResults);
  }

  const obj = value as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  const CACHED_KEYS = new Set(["result", "queryResult", "cachedResult", "queryResults"]);

  for (const [k, v] of Object.entries(obj)) {
    if (CACHED_KEYS.has(k)) continue;
    cleaned[k] = stripCachedResults(v);
  }
  return cleaned;
}

/**
 * Detect all Gen3 service IDs and key request (service method) IDs present
 * anywhere in the config body, including nested structures and embedded DQL.
 *
 * @param body - Raw config object as parsed from the API response
 * @returns Sets of unique detected IDs (upper-cased for consistent comparison)
 */
export function detectServiceReferences(body: unknown): DetectionResult {
  const cleaned = stripCachedResults(body);
  const serialized = JSON.stringify(cleaned);

  const serviceIds = new Set<string>();
  const keyRequestIds = new Set<string>();

  for (const match of serialized.matchAll(GEN3_SERVICE_ID_RE)) {
    serviceIds.add(match[0].toUpperCase());
  }

  for (const match of serialized.matchAll(CLASSIC_SERVICE_ID_RE)) {
    keyRequestIds.add(match[0].toUpperCase());
  }

  return { serviceIds, keyRequestIds };
}

/**
 * Check whether any of the provided names appears as a substring anywhere in
 * the serialized config body.
 *
 * Used for name-based fallback detection (service names, classic service names,
 * key request names) after the ID-based pass. Names shorter than 4 characters
 * are skipped to avoid spurious matches.
 */
export function detectNameReferences(
  body: unknown,
  names: string[],
): boolean {
  if (names.length === 0) return false;
  const serialized = JSON.stringify(stripCachedResults(body));
  return names
    .filter((n) => n.length >= 4)
    .some((name) => serialized.includes(name));
}

/**
 * Determine if a config body contains any reference to a known service or
 * key request, combining both ID-based and name-based detection.
 *
 * @param body - Raw config object
 * @param knownNames - All known service/key-request names to check for
 * @returns true if at least one reference was found
 */
export function hasAnyServiceReference(
  body: unknown,
  knownNames: string[] = [],
): boolean {
  const { serviceIds, keyRequestIds } = detectServiceReferences(body);
  if (serviceIds.size > 0 || keyRequestIds.size > 0) return true;
  return detectNameReferences(body, knownNames);
}

/**
 * For notebook configs: return only the sections that contain service references.
 * Sections without any reference are dropped to keep the stored body minimal.
 */
export function filterNotebookSections(
  body: Record<string, unknown>,
  knownNames: string[] = [],
): Record<string, unknown> {
  const sections = body["sections"];
  if (!Array.isArray(sections)) return body;

  const matching = sections.filter((s) => hasAnyServiceReference(s, knownNames));
  return { ...body, sections: matching };
}

/**
 * For dashboard configs: return only the tiles that contain service references.
 * The tiles field may be an object (keyed by tile ID) or an array.
 */
export function filterDashboardTiles(
  body: Record<string, unknown>,
  knownNames: string[] = [],
): Record<string, unknown> {
  const tiles = body["tiles"];

  if (Array.isArray(tiles)) {
    return {
      ...body,
      tiles: tiles.filter((t) => hasAnyServiceReference(t, knownNames)),
    };
  }

  if (tiles !== null && typeof tiles === "object") {
    const tileMap = tiles as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const [id, tile] of Object.entries(tileMap)) {
      if (hasAnyServiceReference(tile, knownNames)) {
        filtered[id] = tile;
      }
    }
    return { ...body, tiles: filtered };
  }

  return body;
}
