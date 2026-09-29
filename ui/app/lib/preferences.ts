import { stateClient } from "@dynatrace-sdk/client-state";
import { type ConfigurationType, ALL_CATEGORIES } from "../types/scanner";

export const PREFS_KEY = "scanner-prefs";

export interface AppPreferences {
  version: 1;
  period: "24h" | "7d" | "30d";
  showSdv1: boolean;
  showSdv2: boolean;
  serviceFilter: string;
  enabledCategories: Record<ConfigurationType, boolean>;
  servicesExpanded: boolean;
  categoriesExpanded: Record<ConfigurationType, boolean>;
  tablePageSize: number;
}

export const DEFAULT_PREFS: AppPreferences = {
  version: 1,
  period: "24h",
  showSdv1: true,
  showSdv2: true,
  serviceFilter: "",
  enabledCategories: Object.fromEntries(
    ALL_CATEGORIES.map((c) => [c, c !== "notebook" && c !== "openpipeline" && c !== "workflow"]),
  ) as Record<ConfigurationType, boolean>,
  servicesExpanded: false,
  categoriesExpanded: Object.fromEntries(
    ALL_CATEGORIES.map((c) => [c, false]),
  ) as Record<ConfigurationType, boolean>,
  tablePageSize: 20,
};

export function parsePreferences(raw: string | undefined): AppPreferences {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    if (parsed.version !== 1) return { ...DEFAULT_PREFS };
    return {
      version: 1,
      period: (["24h", "7d", "30d"] as const).includes(parsed.period as "24h" | "7d" | "30d")
        ? (parsed.period as AppPreferences["period"])
        : DEFAULT_PREFS.period,
      showSdv1: typeof parsed.showSdv1 === "boolean" ? parsed.showSdv1 : DEFAULT_PREFS.showSdv1,
      showSdv2: typeof parsed.showSdv2 === "boolean" ? parsed.showSdv2 : DEFAULT_PREFS.showSdv2,
      serviceFilter: typeof parsed.serviceFilter === "string" ? parsed.serviceFilter : DEFAULT_PREFS.serviceFilter,
      enabledCategories: isValidCategoryRecord(parsed.enabledCategories)
        ? (parsed.enabledCategories as Record<ConfigurationType, boolean>)
        : { ...DEFAULT_PREFS.enabledCategories },
      servicesExpanded: typeof parsed.servicesExpanded === "boolean" ? parsed.servicesExpanded : DEFAULT_PREFS.servicesExpanded,
      categoriesExpanded: isValidCategoryRecord(parsed.categoriesExpanded)
        ? (parsed.categoriesExpanded as Record<ConfigurationType, boolean>)
        : { ...DEFAULT_PREFS.categoriesExpanded },
      tablePageSize: typeof parsed.tablePageSize === "number" && parsed.tablePageSize > 0
        ? parsed.tablePageSize
        : DEFAULT_PREFS.tablePageSize,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function isValidCategoryRecord(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return ALL_CATEGORIES.every((c) => typeof (value as Record<string, unknown>)[c] === "boolean");
}

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const state = await stateClient.getUserAppState({ key: PREFS_KEY });
    return parsePreferences(state.value);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePreferences(prefs: AppPreferences): Promise<void> {
  try {
    await stateClient.setUserAppState({
      key: PREFS_KEY,
      body: { value: JSON.stringify(prefs) },
    });
  } catch {
    // best-effort — silently ignore save failures
  }
}

export async function resetPreferences(): Promise<void> {
  try {
    await stateClient.deleteUserAppState({ key: PREFS_KEY });
  } catch {
    // ignore if key doesn't exist
  }
}
