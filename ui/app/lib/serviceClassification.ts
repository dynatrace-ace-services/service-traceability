/**
 * SDv1/SDv2 classification logic for service detection versions.
 *
 * Classification is based on the dt.service_detection.version field returned
 * by smartscapeNodes "SERVICE". Known observed values:
 *   "SDv1" — classic service detection (legacy agent-based)
 *   "SDv2" — new service detection (Gen 3)
 *   null / undefined — field absent; treated as unresolved
 *
 * IMPORTANT: If new values are observed in production, update KNOWN_SDV1_VALUES
 * or KNOWN_SDV2_VALUES below rather than changing the classification logic.
 * All constants are exported so callers can override them if needed.
 */

import type { SdClassification, ConfigRecordParsed } from "../types/scanner";

/** All dt.service_detection.version values that classify as SDv1. */
export const KNOWN_SDV1_VALUES = new Set<string>(["SDv1", "1"]);

/** All dt.service_detection.version values that classify as SDv2. */
export const KNOWN_SDV2_VALUES = new Set<string>(["SDv2", "2"]);

/**
 * Classify a single config record based on the service detection versions
 * of all services it references.
 *
 * Rules:
 * - "none"       — no service references at all
 * - "unresolved" — all referenced services have unknown/null detection version
 * - "SDv1"       — at least one SDv1, zero SDv2
 * - "SDv2"       — at least one SDv2, zero SDv1
 * - "mixed"      — at least one SDv1 AND at least one SDv2
 *
 * A config with both resolved and unresolved refs is classified by its
 * resolved refs only; unresolved refs do not change the classification
 * (but are surfaced separately in the unresolved tile).
 */
export function classifyRecord(record: ConfigRecordParsed): SdClassification {
  const versions = record.service_detection_versions;

  if (versions.length === 0 && record.service_ids.length === 0) return "none";

  const hasV1 = versions.some((v) => KNOWN_SDV1_VALUES.has(v));
  const hasV2 = versions.some((v) => KNOWN_SDV2_VALUES.has(v));

  if (!hasV1 && !hasV2) return "unresolved";
  if (hasV1 && hasV2) return "mixed";
  if (hasV1) return "SDv1";
  return "SDv2";
}

/**
 * Classify a raw list of detection version strings (e.g. from a lookup record
 * before full parsing). Used in the workflow for building the versions field.
 */
export function classifyVersionList(
  versions: (string | null | undefined)[],
): SdClassification {
  const resolved = versions.filter(Boolean) as string[];
  if (resolved.length === 0) return "unresolved";

  const hasV1 = resolved.some((v) => KNOWN_SDV1_VALUES.has(v));
  const hasV2 = resolved.some((v) => KNOWN_SDV2_VALUES.has(v));

  if (hasV1 && hasV2) return "mixed";
  if (hasV1) return "SDv1";
  if (hasV2) return "SDv2";
  return "unresolved";
}

export interface ScanSummaryStats {
  totalAnalyzed: number;
  totalRetained: number;
  sdv1Count: number;
  sdv2Count: number;
  mixedCount: number;
  unresolvedCount: number;
  sdv1Percent: number;
  sdv2Percent: number;
}

/**
 * Compute aggregate stats from a list of parsed config records.
 *
 * Counting rules for SDv1/SDv2 tiles:
 * - A "mixed" record is counted in BOTH sdv1Count and sdv2Count.
 * - Percentages use totalRetained (configs with any service reference) as denominator.
 * - "none" records are excluded from all counts (they should not appear in results).
 */
export function computeSummaryStats(records: ConfigRecordParsed[]): ScanSummaryStats {
  const retained = records.filter((r) => r.configuration_id !== "__empty__");
  const totalRetained = retained.length;

  let sdv1Count = 0;
  let sdv2Count = 0;
  let mixedCount = 0;
  let unresolvedCount = 0;

  for (const record of retained) {
    const cls = classifyRecord(record);
    if (cls === "SDv1") sdv1Count++;
    else if (cls === "SDv2") sdv2Count++;
    else if (cls === "mixed") {
      sdv1Count++;
      sdv2Count++;
      mixedCount++;
    } else if (cls === "unresolved") {
      unresolvedCount++;
    }
  }

  const sdv1Percent =
    totalRetained > 0 ? Math.round((sdv1Count / totalRetained) * 100) : 0;
  const sdv2Percent =
    totalRetained > 0 ? Math.round((sdv2Count / totalRetained) * 100) : 0;

  return {
    totalAnalyzed: 0, // filled in by caller from scan summary
    totalRetained,
    sdv1Count,
    sdv2Count,
    mixedCount,
    unresolvedCount,
    sdv1Percent,
    sdv2Percent,
  };
}
