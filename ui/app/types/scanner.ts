/**
 * Shared data model between the scan workflow output and the application UI.
 * All lookup table fields use JSON-encoded strings for array values so that
 * the tabular upload format stays flat while DQL can still parse them with parseJson().
 */

export type ConfigurationType =
  | "dashboard"
  | "notebook"
  | "anomaly-detection"
  | "slo"
  | "sre"
  | "openpipeline"
  | "workflow";

export type ResolutionStatus = "complete" | "partial" | "failed";

export type ServiceDetectionVersion = "SDv1" | "SDv2";

/** A single configuration record as stored in a lookup table row. */
export interface ConfigRecord {
  /** Unique identifier for this config within its category — used as lookupField. */
  configuration_id: string;
  configuration_type: ConfigurationType;
  configuration_name: string;
  /** Direct URL to the configuration in the Dynatrace UI, or empty string if unknown. */
  configuration_url: string;
  /** JSON-encoded string array, e.g. '["SERVICE-ABC123","SERVICE-DEF456"]' */
  service_ids: string;
  service_names: string;
  service_classic_ids: string;
  service_classic_names: string;
  key_request_ids: string;
  key_request_names: string;
  /** JSON-encoded string array of distinct dt.service_detection.version values. */
  service_detection_versions: string;
  segment_names: string;
  /** ISO 8601 timestamp of the scan that produced this record. */
  scan_timestamp: string;
  resolution_status: ResolutionStatus;
}

/** Sentinel record written when a category has zero results, to clear stale data. */
export const EMPTY_SENTINEL_ID = "__empty__";

/** Parsed (in-memory) representation of a config record, with arrays expanded. */
export interface ConfigRecordParsed {
  configuration_id: string;
  configuration_type: ConfigurationType;
  configuration_name: string;
  configuration_url: string;
  service_ids: string[];
  service_names: string[];
  service_classic_ids: string[];
  service_classic_names: string[];
  key_request_ids: string[];
  key_request_names: string[];
  service_detection_versions: string[];
  segment_names: string[];
  scan_timestamp: string;
  resolution_status: ResolutionStatus;
}

/** Resolved mapping for a single Gen3 service. */
export interface ServiceMapping {
  /** Gen3 service entity ID (SERVICE-{16hex}) */
  id: string;
  name: string;
  /** Classic service entity ID */
  classicId: string;
  classicName: string;
  /** null when resolution failed or the service has no detection version recorded */
  detectionVersion: ServiceDetectionVersion | null;
  keyRequests: KeyRequestMapping[];
}

export interface KeyRequestMapping {
  id: string;
  name: string;
}

/** SDv1/SDv2 classification result for a single parsed record. */
export type SdClassification = "SDv1" | "SDv2" | "mixed" | "unresolved" | "none";

/** Aggregated scan execution summary, returned by the workflow and stored in app state. */
export interface ScanSummary {
  scan_timestamp: string;
  status: "success" | "partial" | "failed";
  categories: Record<
    ConfigurationType,
    {
      analyzed: number;
      retained: number;
      errors: number;
      lookup_updated: boolean;
    }
  >;
  total_analyzed: number;
  total_retained: number;
  total_errors: number;
  error_details: string[];
}

export const WORKFLOW_TITLE = "Service Traceability";
export const WORKFLOW_ID = "c4f1e2d3-5a6b-7c8d-9e0f-a1b2c3d4e5f6";

export const SUMMARY_LOOKUP_PATH = "/lookups/scanner-service-configuration/summary";

/** Row from the per-category summary lookup table produced by the scan workflow. */
export interface SummaryRow {
  configuration_type: ConfigurationType;
  total_analyzed: number;
  found_by_service_id: number;
  found_by_service_name: number;
  found_with_key_request: number;
  error_count: number;
  retained_count: number;
  scan_timestamp: string;
}

export const LOOKUP_PATHS: Record<ConfigurationType, string> = {
  dashboard: "/lookups/scanner-service-configuration/dashboard",
  notebook: "/lookups/scanner-service-configuration/notebook",
  "anomaly-detection": "/lookups/scanner-service-configuration/anomaly-detection",
  slo: "/lookups/scanner-service-configuration/slo",
  sre: "/lookups/scanner-service-configuration/sre",
  openpipeline: "/lookups/scanner-service-configuration/openpipeline",
  workflow: "/lookups/scanner-service-configuration/workflow",
};

export const ALL_CATEGORIES: ConfigurationType[] = [
  "dashboard",
  "notebook",
  "anomaly-detection",
  "slo",
  "sre",
  "openpipeline",
  "workflow",
];

/**
 * One row returned by the per-category Smartscape-JOIN-lookup DQL query.
 * Each row represents one (service × config) pair with live enrichment.
 */
export interface SmartscapeRow {
  configuration_name: string;
  configuration_url: string;
  configuration_id: string;
  /** "SDv1" | "SDv2" | ">30d empty" */
  type: string;
  /** Live service name from Smartscape */
  service_name: string;
  /** entity.name from dt.entity.service (classic entity) */
  classic_name: string | null;
  /** Entity ID (SERVICE-XXXXXXXX) */
  service_id: string;
  /** First matching key request entity ID (dt.entity.service_method) */
  key_request_id: string | null;
  /** First matching key request name */
  key_request_name: string | null;
}

/**
 * Build the DQL query for one configuration category.
 * Starts from Smartscape SERVICE nodes, joins with the lookup table,
 * enriches with entity name and first key request.
 */
export function buildCategoryQuery(lookupPath: string): string {
  return (
    `smartscapeNodes "SERVICE", from: -30d | fields id, name, dt.service_detection.version, id_classic\n` +
    `| join [load "${lookupPath}" | parse service_ids, "JSON_ARRAY:id_classic" | expand id_classic], on: id_classic, fields: {configuration_name, configuration_url, configuration_id}\n` +
    `| filter isnotnull(configuration_name)\n` +
    `| filter isnotnull(dt.service_detection.version)\n` +
    `| lookup [fetch dt.entity.service | fields id, entity.name], sourceField:id_classic, lookupField:id, fields: { classic_name = entity.name}\n` +
    `| lookup [fetch dt.entity.service_method | fieldsAdd service_id=belongs_to[dt.entity.service]], sourceField:id_classic, lookupField:service_id, fields: { key_request_id = id, key_request_name = entity.name}\n` +
    `| fields configuration_name, configuration_url, configuration_id, type=if(isnotnull(dt.service_detection.version),concat("SDv",dt.service_detection.version), else: ">30d empty"), service_name=name, classic_name, service_id=id_classic, key_request_id, key_request_name`
  );
}

export interface ServiceRow {
  "dt.service_detection.version": string;
  id: string;
  name: string;
  classic_name: string;
  service_methods: Array<{ key_request_id: string; key_request_name: string }> | null;
}

export interface FilterRecord {
  configuration_id: string;
  configuration_type: string;
  configuration_name: string;
  filter_count: number;
  filters: string;
  filters_json_length: number;
  scan_timestamp: string;
}

export interface FilterMatchRow {
  configuration_id: string;
  configuration_name: string;
  service_id: string;
  service_name: string;
  classic_name: string | null;
  key_request_id: string | null;
  key_request_name: string | null;
  sdv_type: "SDv1" | "SDv2";
  matched_field: "id" | "name" | "classic_name" | "key_request_id" | "key_request_name";
  matched_value: string;
  matched_filter: string;
}

export const FILTER_LOOKUP_PATHS: Record<ConfigurationType, string> = {
  dashboard: "/lookups/scanner-service-configuration/filter-dashboard",
  notebook: "/lookups/scanner-service-configuration/filter-notebook",
  "anomaly-detection": "/lookups/scanner-service-configuration/filter-anomaly-detection",
  slo: "/lookups/scanner-service-configuration/filter-slo",
  sre: "/lookups/scanner-service-configuration/filter-sre",
  openpipeline: "/lookups/scanner-service-configuration/filter-openpipeline",
  workflow: "/lookups/scanner-service-configuration/filter-workflow",
};

export function buildServiceQuery(period: string): string {
  return [
    `smartscapeNodes "SERVICE", from: -${period}`,
    "| fields name, `dt.service_detection.version`, id_classic",
    "| lookup [",
    `    fetch dt.entity.service, from: -${period}`,
    "    | fields id, entity.name",
    "  ],",
    "  sourceField: id_classic,",
    "  lookupField: id,",
    "  fields: { id, classic_name = entity.name }",
    "| lookup [",
    `    fetch dt.entity.service_method, from: -${period}`,
    "    | fieldsAdd service_id = belongs_to[dt.entity.service]",
    "    | summarize service_methods = collectArray(",
    "        record(",
    "          key_request_id = id,",
    "          key_request_name = entity.name",
    "        )",
    "      ),",
    "      by: { service_id }",
    "  ],",
    "  sourceField: id_classic,",
    "  lookupField: service_id,",
    "  fields: { service_methods }",
    "| fields",
    "    `dt.service_detection.version`,",
    "    id,",
    "    name,",
    "    classic_name,",
    "    service_methods",
    "| limit 20000",
  ].join("\n");
}

export function buildFilterQuery(lookupPath: string): string {
  return `load "${lookupPath}" | filter configuration_id != "__empty__" | fields configuration_id, configuration_name, filter_count, filters`;
}

/** Serialize a string array to the compact format used in lookup table cells. */
export function serializeArray(values: string[]): string {
  return JSON.stringify([...new Set(values)].filter(Boolean));
}

/** Parse a lookup table cell back to a string array. */
export function parseArray(value: string): string[] {
  if (!value || value === "[]") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Expand a flat ConfigRecord into a ConfigRecordParsed with proper arrays. */
export function parseConfigRecord(record: ConfigRecord): ConfigRecordParsed {
  return {
    configuration_id: record.configuration_id,
    configuration_type: record.configuration_type,
    configuration_name: record.configuration_name,
    configuration_url: record.configuration_url,
    service_ids: parseArray(record.service_ids),
    service_names: parseArray(record.service_names),
    service_classic_ids: parseArray(record.service_classic_ids),
    service_classic_names: parseArray(record.service_classic_names),
    key_request_ids: parseArray(record.key_request_ids),
    key_request_names: parseArray(record.key_request_names),
    service_detection_versions: parseArray(record.service_detection_versions),
    segment_names: parseArray(record.segment_names),
    scan_timestamp: record.scan_timestamp,
    resolution_status: record.resolution_status,
  };
}
