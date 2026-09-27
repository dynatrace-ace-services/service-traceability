/**
 * Centralized URL builders for navigating to Dynatrace configurations.
 *
 * Routes are derived from the scanner-script-python URL builders and verified
 * against the platform. Routes that are not confirmed return null — callers
 * must render those as plain text rather than hyperlinks.
 *
 * The environment base URL is read from the app environment at runtime.
 */

import type { ConfigurationType } from "../types/scanner";

/**
 * Build a URL for a Settings API object (used for SLOs (classic), anomaly
 * detection rules, SRE guardians, and Davis anomaly detectors).
 * Route: confirmed from scanner-script-python service_config_report.py
 */
export function settingsObjectUrl(envUrl: string, objectId: string): string {
  return `${envUrl.replace(/\/$/, "")}/ui/settings?objectId=${encodeURIComponent(objectId)}`;
}

/**
 * Build a URL for a dashboard.
 * Route: confirmed from scanner-script-python
 */
export function dashboardUrl(envUrl: string, id: string): string {
  return `${envUrl.replace(/\/$/, "")}/ui/apps/dynatrace.dashboards/dashboard/${encodeURIComponent(id)}`;
}

/**
 * Build a URL for a notebook.
 * Route: confirmed from scanner-script-python
 */
export function notebookUrl(envUrl: string, id: string): string {
  return `${envUrl.replace(/\/$/, "")}/ui/apps/dynatrace.notebooks/notebook/${encodeURIComponent(id)}`;
}

/**
 * Build a URL for a platform SLO.
 * Route: confirmed from scanner-script-python
 */
export function sloUrl(envUrl: string, id: string): string {
  const intent = JSON.stringify({ "dt.slo.id": id });
  return `${envUrl.replace(/\/$/, "")}/ui/intent/dynatrace.service.level.objectives/view-slo#${encodeURIComponent(intent)}`;
}

/**
 * Build a URL for a Dynatrace Workflow.
 * Route: NOT confirmed. Returns null; callers must display without hyperlink.
 */
export function workflowUrl(): null {
  return null;
}

/**
 * Build a URL for an SRE Guardian.
 * Route: NOT confirmed. Returns null; callers must display without hyperlink.
 */
export function sreUrl(): null {
  return null;
}

/**
 * Build a URL for an OpenPipeline configuration.
 * Route: NOT confirmed (API endpoint itself is pending research).
 * Returns null; callers must display without hyperlink.
 */
export function openpipelineUrl(): null {
  return null;
}

/**
 * Resolve the direct URL for any supported configuration type.
 * Returns null when no confirmed route exists for the given type.
 */
export function resolveConfigUrl(
  envUrl: string,
  type: ConfigurationType,
  id: string,
  objectId?: string,
): string | null {
  switch (type) {
    case "dashboard":
      return dashboardUrl(envUrl, id);
    case "notebook":
      return notebookUrl(envUrl, id);
    case "slo":
      return sloUrl(envUrl, id);
    case "anomaly-detection":
      return objectId ? settingsObjectUrl(envUrl, objectId) : null;
    case "sre":
      return sreUrl();
    case "workflow":
      return workflowUrl();
    case "openpipeline":
      return openpipelineUrl();
    default:
      return null;
  }
}
