import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, SegmentSelector, useSegments } from "@dynatrace/strato-components/filters";
import { SearchInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

import { useWorkflow } from "../hooks/useWorkflow";
import { executeDql } from "../lib/dql";
import { matchServiceToFilters } from "../lib/matching";
import { loadPreferences, savePreferences, type AppPreferences } from "../lib/preferences";
import { ConfigSection } from "../components/ConfigSection";
import { ServicesSection } from "../components/ServicesSection";
import { OutlineButton, PillButton, PrimaryButton } from "../components/ToolbarButton";
import {
  ALL_CATEGORIES,
  FILTER_LOOKUP_PATHS,
  buildServiceQuery,
  buildFilterQuery,
  type ConfigurationType,
  type FilterMatchRow,
  type FilterRecord,
  type ServiceRow,
  type SummaryRow,
} from "../types/scanner";

interface StatsRow {
  sdv1: number;
  sdv2: number;
  total: number;
}

interface SdvCountRow {
  "dt.service_detection.version": number | string;
  count: number | string;
}


type Period = "24h" | "7d" | "30d";

function buildStatsQuery(period: string): string {
  return [
    `smartscapeNodes "SERVICE", from: -${period}`,
    "| filter isnotnull(dt.service_detection.version)",
    '| fieldsAdd sdv_type = concat("SDv", dt.service_detection.version)',
    '| summarize {sdv1 = countIF(sdv_type=="SDv1"), sdv2 = countIF(sdv_type=="SDv2"), total=count()}',
  ].join("\n");
}

const iconSrc = `${window.location.origin}/ui/assets/service-traceability-icon.png`;
const APP_VERSION = "0.0.13";
const GITHUB_URL = "https://github.com/dynatrace-ace-services/service-traceability";
const README_URL = "https://github.com/dynatrace-ace-services/service-traceability/blob/main/README.md";
const DOCS_URL = "https://docs.dynatrace.com/docs/observe/application-observability/services/service-detection";

type FilterData = Record<ConfigurationType, FilterRecord[]>;
type MatchData = Record<ConfigurationType, FilterMatchRow[]>;

const EMPTY_FILTER_RECORDS: FilterData = Object.fromEntries(
  ALL_CATEGORIES.map((c): [ConfigurationType, FilterRecord[]] => [c, []]),
) as FilterData;

const EMPTY_MATCH_DATA: MatchData = Object.fromEntries(
  ALL_CATEGORIES.map((c): [ConfigurationType, FilterMatchRow[]] => [c, []]),
) as MatchData;

function toCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportToCsv(data: MatchData, enabledCategories: Record<ConfigurationType, boolean>): void {
  const headers = [
    "Type", "Configuration Name", "Configuration ID",
    "Service Name", "Classic Name", "Service ID", "SDv",
    "Key Request Name", "Key Request ID",
    "Matched Field", "Matched Value", "Matched Filter",
  ];
  const rows: string[][] = [headers];

  for (const cat of ALL_CATEGORIES) {
    if (!enabledCategories[cat]) continue;
    for (const row of data[cat]) {
      rows.push([
        cat,
        row.configuration_name,
        row.configuration_id,
        row.service_name,
        row.classic_name ?? "",
        row.service_id,
        row.sdv_type,
        row.key_request_name ?? "",
        row.key_request_id ?? "",
        row.matched_field,
        row.matched_value,
        row.matched_filter,
      ]);
    }
  }

  const csv = rows.map((r) => r.map(toCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `service-traceability-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Scanner() {
  const workflow = useWorkflow();
  const { segments } = useSegments();

  const [showAbout, setShowAbout] = useState(false);
  const [dqlStats, setDqlStats] = useState<StatsRow | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const [serviceFilter, setServiceFilter] = useState("");
  const [period, setPeriod] = useState<Period>("24h");
  const [showSdv1, setShowSdv1] = useState(true);
  const [showSdv2, setShowSdv2] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [filterRecords, setFilterRecords] = useState<FilterData>(EMPTY_FILTER_RECORDS);
  const [analyzedByCategory, setAnalyzedByCategory] = useState<Partial<Record<ConfigurationType, number>>>({});
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [serviceWarnings, setServiceWarnings] = useState<string[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<Record<ConfigurationType, boolean>>(
    () => Object.fromEntries(
      ALL_CATEGORIES.map((c) => [c, c !== "notebook" && c !== "openpipeline" && c !== "workflow"]),
    ) as Record<ConfigurationType, boolean>,
  );

  const [lastScanTime, setLastScanTime] = useState<Date | null>(() => {
    try {
      const stored = localStorage.getItem("service-traceability-last-scan");
      return stored ? new Date(stored) : null;
    } catch {
      return null;
    }
  });

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState<Record<ConfigurationType, boolean>>(
    () => Object.fromEntries(ALL_CATEGORIES.map((c) => [c, false])) as Record<ConfigurationType, boolean>,
  );
  const [tablePageSize, setTablePageSize] = useState(20);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted preferences on mount
  useEffect(() => {
    void loadPreferences().then((prefs) => {
      setPeriod(prefs.period);
      setShowSdv1(prefs.showSdv1);
      setShowSdv2(prefs.showSdv2);
      setServiceFilter(prefs.serviceFilter);
      setEnabledCategories(prefs.enabledCategories);
      setServicesExpanded(prefs.servicesExpanded);
      setCategoriesExpanded(prefs.categoriesExpanded);
      setTablePageSize(prefs.tablePageSize);
      setPrefsLoaded(true);
    });
  }, []);

  // Debounced auto-save whenever any persisted preference changes
  useEffect(() => {
    if (!prefsLoaded) return;
    const prefs: AppPreferences = {
      version: 1,
      period,
      showSdv1,
      showSdv2,
      serviceFilter,
      enabledCategories,
      servicesExpanded,
      categoriesExpanded,
      tablePageSize,
    };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void savePreferences(prefs); }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [prefsLoaded, period, showSdv1, showSdv2, serviceFilter, enabledCategories, servicesExpanded, categoriesExpanded, tablePageSize]);

  const toggleCategory = useCallback((cat: ConfigurationType) => {
    setEnabledCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const loadDataRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (loadDataRef.current) loadDataRef.current.abort();
    const controller = new AbortController();
    loadDataRef.current = controller;
    setIsDataLoading(true);
    setIsServicesLoading(true);

    void (async () => {
      try {
        const segs = segments.length ? segments : undefined;
        const serviceQuery = buildServiceQuery(period);
        let serviceQueryMs = 0;
        const timedServiceQuery = async () => {
          const t = Date.now();
          const r = await executeDql<ServiceRow>(serviceQuery, segs, { maxResultRecords: 20000 }).catch(() => ({
            records: [] as ServiceRow[],
            warnings: [] as string[],
          }));
          serviceQueryMs = Date.now() - t;
          return r;
        };
        const [statsResult, servicesResult, filterResults, scanCountResult, summaryResult, sdvCountResult] =
          await Promise.all([
            executeDql<StatsRow>(buildStatsQuery(period), segs).catch(() => ({ records: [] as StatsRow[], warnings: [] })),
            timedServiceQuery(),
            Promise.all(
              ALL_CATEGORIES.map(async (cat) => {
                try {
                  const { records } = await executeDql<FilterRecord>(
                    buildFilterQuery(FILTER_LOOKUP_PATHS[cat]),
                    segs,
                    { maxResultRecords: 10_000_000 },
                  );
                  return [cat, records] as const;
                } catch {
                  return [cat, [] as FilterRecord[]] as const;
                }
              }),
            ),
            executeDql<{ scan: number }>(
              [
                'load "/lookups/scanner-service-configuration/filter-summary"',
                "| summarize scan = sum(total_analyzed), by:{scan_timestamp}",
                "| sort scan_timestamp desc",
                "| limit 1",
                "| fields scan",
              ].join("\n"),
              segs,
            ).catch(() => ({ records: [] as { scan: number }[], warnings: [] })),
            executeDql<SummaryRow>(
              [
                'load "/lookups/scanner-service-configuration/filter-summary"',
                "| fields configuration_type, total_analyzed",
              ].join("\n"),
              segs,
            ).catch(() => ({ records: [] as SummaryRow[], warnings: [] })),
            executeDql<SdvCountRow>(
              [
                `smartscapeNodes "SERVICE", from: -${period}`,
                "| summarize count = count(), by:{dt.service_detection.version}",
              ].join("\n"),
              segs,
            ).catch(() => ({ records: [] as SdvCountRow[], warnings: [] })),
          ]);

        if (!controller.signal.aborted) {
          const row = statsResult.records[0];
          if (row) {
            const toNum = (v: unknown) =>
              typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;
            setDqlStats({ sdv1: toNum(row.sdv1), sdv2: toNum(row.sdv2), total: toNum(row.total) });
          }

          setServices(servicesResult.records);
          setServiceWarnings(servicesResult.warnings ?? []);
          setLastServiceQuery(serviceQuery);
          setLastServiceMeta({ count: servicesResult.records.length, ms: serviceQueryMs });
          setFilterRecords(Object.fromEntries(filterResults as [ConfigurationType, FilterRecord[]][]) as FilterData);

          const toNum = (v: unknown) =>
            typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;
          const scanRow = scanCountResult.records[0];
          setScanCount(scanRow ? toNum(scanRow.scan) : 0);

          const analyzedMap: Partial<Record<ConfigurationType, number>> = {};
          for (const r of summaryResult.records) {
            analyzedMap[r.configuration_type] = toNum(r.total_analyzed);
          }
          setAnalyzedByCategory(analyzedMap);

          let sdv1 = 0, sdv2 = 0;
          for (const r of sdvCountResult.records) {
            const ver = toNum(r["dt.service_detection.version"]);
            const cnt = toNum(r.count);
            if (ver === 1) sdv1 = cnt;
            else if (ver === 2) sdv2 = cnt;
          }
          setSdvCounts(sdvCountResult.records.length > 0 ? { sdv1, sdv2 } : null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsDataLoading(false);
          setIsServicesLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [loadTrigger, segments, period]);

  const handleScan = useCallback(() => {
    void workflow.trigger(enabledCategories, () => {
      const now = new Date();
      setLastScanTime(now);
      try { localStorage.setItem("service-traceability-last-scan", now.toISOString()); } catch { /* ignore */ }
      setLoadTrigger((t) => t + 1);
    });
  }, [enabledCategories, workflow]);

  const [isComparing, setIsComparing] = useState(false);
  const [matchedData, setMatchedData] = useState<MatchData>(EMPTY_MATCH_DATA);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!services.length) {
      setMatchedData(EMPTY_MATCH_DATA);
      return;
    }

    cancelRef.current = false;
    setIsComparing(true);
    setMatchedData(EMPTY_MATCH_DATA);

    const toNum = (v: unknown) =>
      typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;

    const yield_ = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    void (async () => {
      for (const cat of ALL_CATEGORIES) {
        if (cancelRef.current) break;

        const records = filterRecords[cat] ?? [];
        const rows: FilterMatchRow[] = [];
        let opCount = 0;

        for (const record of records) {
          if (cancelRef.current) break;

          let filters: string[];
          try {
            filters = JSON.parse(record.filters) as string[];
          } catch {
            continue;
          }
          if (!filters.length) continue;

          for (const svc of services) {
            if (cancelRef.current) break;

            const fieldMatches = matchServiceToFilters(svc, filters);
            for (const fm of fieldMatches) {
              rows.push({
                configuration_id: record.configuration_id,
                configuration_name: record.configuration_name,
                service_id: svc.id,
                service_name: svc.name,
                classic_name:
                  svc.classic_name && svc.classic_name !== svc.name ? svc.classic_name : null,
                key_request_id: fm.keyRequestId ?? null,
                key_request_name: fm.keyRequestName ?? null,
                sdv_type: toNum(svc["dt.service_detection.version"]) === 1 ? "SDv1" : "SDv2",
                matched_field: fm.field,
                matched_value: fm.value,
                matched_filter: fm.filter,
              });
            }

            opCount++;
            if (opCount % 2000 === 0) await yield_();
          }
        }

        if (!cancelRef.current) {
          const seen = new Set<string>();
          const deduped = rows.filter((row) => {
            const key = `${row.configuration_id}|${row.service_id}|${row.matched_field}|${row.matched_value}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setMatchedData((prev) => ({ ...prev, [cat]: deduped }));
        }

        await yield_();
      }

      if (!cancelRef.current) setIsComparing(false);
    })();

    return () => { cancelRef.current = true; };
  }, [services, filterRecords]);

  const filteredMatchedData = useMemo<MatchData>(() => {
    const sf = serviceFilter.trim().toLowerCase();
    const neitherSdv = !showSdv1 && !showSdv2;

    return Object.fromEntries(
      ALL_CATEGORIES.map((cat) => {
        const filtered = (matchedData[cat] ?? []).filter((row) => {
          if (sf) {
            const fields = [
              row.service_name,
              row.classic_name,
              row.service_id,
              row.key_request_id,
              row.key_request_name,
            ];
            if (!fields.some((v) => v && v.toLowerCase().includes(sf))) return false;
          }
          if (!neitherSdv) {
            if (row.sdv_type === "SDv1" && !showSdv1) return false;
            if (row.sdv_type === "SDv2" && !showSdv2) return false;
          }
          return true;
        });
        return [cat, filtered] as const;
      }),
    ) as MatchData;
  }, [matchedData, serviceFilter, showSdv1, showSdv2]);

  const filteredServices = useMemo<ServiceRow[]>(() => {
    const sf = serviceFilter.trim().toLowerCase();
    const toNum = (v: unknown) =>
      typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;
    const neitherSdv = !showSdv1 && !showSdv2;

    return services.filter((s) => {
      if (sf) {
        const methodValues = (s.service_methods ?? []).flatMap((m) => [m.key_request_id, m.key_request_name]);
        const fields = [s.name, s.classic_name, s.id, ...methodValues];
        if (!fields.some((v) => v && String(v).toLowerCase().includes(sf))) return false;
      }
      if (!neitherSdv) {
        const v = toNum(s["dt.service_detection.version"]);
        if (v === 1 && !showSdv1) return false;
        if (v === 2 && !showSdv2) return false;
      }
      return true;
    });
  }, [services, serviceFilter, showSdv1, showSdv2]);

  const [scanCount, setScanCount] = useState(0);
  const [sdvCounts, setSdvCounts] = useState<{ sdv1: number; sdv2: number } | null>(null);
  const [showDqlModal, setShowDqlModal] = useState(false);
  const [lastServiceQuery, setLastServiceQuery] = useState("");
  const [lastServiceMeta, setLastServiceMeta] = useState<{ count: number; ms: number } | null>(null);

  const hasAnyData = useMemo(
    () => services.length > 0 || ALL_CATEGORIES.some((cat) => filterRecords[cat].length > 0),
    [services, filterRecords],
  );

  const stats = useMemo(() => {
    const sdv1 = dqlStats?.sdv1 ?? 0;
    const sdv2 = dqlStats?.sdv2 ?? 0;
    const total = dqlStats?.total ?? 0;
    const sdv1Pct = total > 0 ? Math.round((sdv1 / total) * 100) : 0;
    const sdv2Pct = total > 0 ? Math.round((sdv2 / total) * 100) : 0;
    return { sdv1, sdv2, sdv1Pct, sdv2Pct };
  }, [dqlStats]);

  const handleCancelCompare = useCallback(() => {
    cancelRef.current = true;
    setIsComparing(false);
  }, []);

  const handleCsvExport = useCallback(() => {
    exportToCsv(filteredMatchedData, enabledCategories);
  }, [filteredMatchedData, enabledCategories]);

  const anyEnabled = ALL_CATEGORIES.some((c) => enabledCategories[c]);

  const scanButtonLabel = workflow.isRunning ? "Scanning…" : "Scan Configurations";

  function formatScanTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const border = "1px solid #2D3748";

  const showSections = hasAnyData;

  return (
    <Flex flexDirection="column" gap={0} height="100%">
      <style>{`
        @keyframes st-compare-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(285%); }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <Flex
        flexDirection="row"
        alignItems="center"
        gap={8}
        paddingX={12}
        paddingY={8}
        style={{ borderBottom: border, flexShrink: 0 }}
      >
        <PrimaryButton disabled={workflow.isRunning || !anyEnabled} onClick={handleScan}>
          {scanButtonLabel}
        </PrimaryButton>

        <Text style={{ color: "#4B5563", fontSize: "0.85em", whiteSpace: "nowrap" }}>|</Text>
        {workflow.statusMessage ? (
          <Text style={{ color: workflow.status === "error" ? "#FCA5A5" : "#9CA3AF" }}>
            {workflow.statusMessage}
          </Text>
        ) : (
          <Text style={{ color: "#6B7280", fontSize: "0.85em", whiteSpace: "nowrap" }}>
            {"Last scan: "}
            {lastScanTime ? formatScanTime(lastScanTime) : "Never"}
          </Text>
        )}
        {isDataLoading && !workflow.isRunning && <Text>Loading…</Text>}

        <Flex flexGrow={1} />

        <PillButton active={showSdv1} accent="cyan" onClick={() => { setShowSdv1((v) => !v); }}>
          SDv1
        </PillButton>
        <PillButton active={showSdv2} accent="pink" onClick={() => { setShowSdv2((v) => !v); }}>
          SDv2
        </PillButton>

        <OutlineButton onClick={handleCsvExport}>
          Export CSV
        </OutlineButton>

        <Flex flexGrow={1} />

        <FilterBar onFilterChange={() => {}}>
          <FilterBar.Item name="segment" label="">
            <SegmentSelector />
          </FilterBar.Item>
          <FilterBar.Item name="serviceFilter" label="">
            <SearchInput
              value={serviceFilter}
              onChange={(v) => { setServiceFilter(v ?? ""); }}
              placeholder="Filter by name or ID"
            />
          </FilterBar.Item>
        </FilterBar>

        {(["24h", "7d", "30d"] as const).map((p) => (
          <PillButton
            key={p}
            active={period === p}
            accent="cyan"
            onClick={() => { setPeriod(p); }}
          >
            {p}
          </PillButton>
        ))}
      </Flex>

      {/* ── Stats bar ── */}
      <Flex
        flexDirection="column"
        style={{ borderBottom: border, flexShrink: 0 }}
      >
        <Flex flexDirection="row" alignItems="center" gap={12} paddingX={12} paddingY={4}>
          {hasAnyData ? (
            <>
              <Text><strong>{scanCount}</strong> scan</Text>
              <span style={{ color: "#2D3748" }}>|</span>
              <Text>
                SDv1: <strong>{dqlStats ? stats.sdv1 : "—"}</strong>
                {dqlStats && <span style={{ opacity: 0.6 }}>{" "}({stats.sdv1Pct}%)</span>}
              </Text>
              <Text>
                SDv2: <strong>{dqlStats ? stats.sdv2 : "—"}</strong>
                {dqlStats && <span style={{ opacity: 0.6 }}>{" "}({stats.sdv2Pct}%)</span>}
              </Text>
              {serviceWarnings.length > 0 && (
                <>
                  <span style={{ color: "#2D3748" }}>|</span>
                  <Text style={{ color: "#F59E0B", fontSize: "0.85em" }}>
                    ⚠ {serviceWarnings.join(" · ")}
                  </Text>
                </>
              )}
            </>
          ) : (
            <Text style={{ opacity: 0.6 }}>No data — run a scan first</Text>
          )}
          <Flex flexGrow={1} />
          <OutlineButton onClick={() => { setShowAbout((v) => !v); }}>
            {`ℹ About ${showAbout ? "▲" : "▼"}`}
          </OutlineButton>
        </Flex>

        {isComparing && (
          <Flex
            flexDirection="row"
            alignItems="center"
            gap={8}
            paddingX={12}
            paddingY={4}
            style={{ borderTop: border }}
          >
            <Text style={{ fontSize: "0.82em", color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0 }}>
              Analyzing references…
            </Text>
            <div style={{ flex: 1, height: 3, background: "#1F2937", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: "35%",
                background: "var(--dt-colors-brand-primary, #6366F1)",
                borderRadius: 2,
                animation: "st-compare-slide 1.4s ease-in-out infinite",
              }} />
            </div>
            <OutlineButton onClick={handleCancelCompare}>Cancel</OutlineButton>
          </Flex>
        )}

        {showAbout && (
          <Flex
            flexDirection="row"
            alignItems="flex-start"
            style={{ borderTop: border, position: "relative" }}
          >
            {/* Col 1 — Logo 15% */}
            <Flex
              alignItems="center"
              justifyContent="center"
              style={{ width: "15%", padding: "12px 16px", alignSelf: "center", flexShrink: 0 }}
            >
              <img
                src={iconSrc}
                alt="Service Traceability"
                style={{ width: 152, height: 152, borderRadius: 14 }}
              />
            </Flex>

            {/* Col 2 — Summary */}
            <Flex flexDirection="column" gap={4} style={{ flex: 1, padding: "12px 16px 12px 4px" }}>
              <span style={{ fontSize: "0.7em", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.5, textTransform: "uppercase" }}>
                Summary
              </span>
              <div style={{ fontSize: "0.875em", lineHeight: 1.65 }}>
                <strong>Service Traceability</strong> helps you discover where services and key
                requests are referenced across Dynatrace configurations. Use filters, time ranges,
                and SDv1/SDv2 views to analyze dependencies and support service detection migration
                efforts.
              </div>
            </Flex>

            {/* Separator */}
            <div style={{ width: 1, backgroundColor: "#2D3748", margin: "10px 0", alignSelf: "stretch", flexShrink: 0 }} />

            {/* Col 3 — Quick Start */}
            <Flex flexDirection="column" gap={4} style={{ flex: 1, padding: "12px 20px", fontSize: "0.875em" }}>
              <span style={{ fontSize: "0.7em", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.5, textTransform: "uppercase" }}>
                Quick Start
              </span>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>
                  Prerequisite (see{" "}
                  <a href={README_URL} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>README</a>
                  ).
                </li>
                <li>Enable or disable the configuration types to scan.</li>
                <li>Click &quot;Scan Configurations&quot;.</li>
                <li>Refine results using SDv1/SDv2 segments and search filters.</li>
                <li>Export CSV and review the identified configurations.</li>
              </ol>
            </Flex>

            {/* Separator */}
            <div style={{ width: 1, backgroundColor: "#2D3748", margin: "10px 0", alignSelf: "stretch", flexShrink: 0 }} />

            {/* Col 4 — Project 20% */}
            <Flex flexDirection="column" gap={4} style={{ width: "20%", padding: "12px 16px", fontSize: "0.875em" }}>
              <span style={{ fontSize: "0.7em", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.5, textTransform: "uppercase" }}>
                Project
              </span>
              <Flex flexDirection="column" gap={6}>
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                  Documentation
                </a>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                  GitHub Repository
                </a>
                <span style={{ opacity: 0.5, marginTop: 2 }}>Version {APP_VERSION}</span>
              </Flex>
            </Flex>

            <div
              style={{
                position: "absolute",
                bottom: 6,
                right: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 1,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "#8A8D93",
                  opacity: 0.88,
                  letterSpacing: "0.05em",
                  userSelect: "none",
                  fontWeight: 500,
                }}
              >
                Professional Services France
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#8A8D93",
                  opacity: 0.72,
                  letterSpacing: "0.03em",
                  userSelect: "none",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.72"; }}
              >
                Designed by @JLL
              </span>
            </div>
          </Flex>
        )}
      </Flex>

      {/* ── Results — sole scroll zone ── */}
      <Flex flexDirection="column" gap={8} padding={12} flexGrow={1} style={{ overflowY: "auto" }}>
        {isDataLoading ? (
          <Text style={{ opacity: 0.6 }}>Loading…</Text>
        ) : !showSections ? (
          <Flex flexDirection="column" alignItems="center" padding={32}>
            <Text>No scan data yet. Click &quot;Scan Configurations&quot; to start.</Text>
          </Flex>
        ) : (
          <>
            <ServicesSection
              services={filteredServices}
              isLoading={isServicesLoading}
              sdv1Total={sdvCounts?.sdv1}
              sdv2Total={sdvCounts?.sdv2}
              rawTotal={services.length}
              expanded={servicesExpanded}
              onExpandedChange={setServicesExpanded}
              pageSize={tablePageSize}
              onPageSizeChange={setTablePageSize}
              onShowDql={() => { setShowDqlModal(true); }}
              serviceFilter={serviceFilter}
            />
            {ALL_CATEGORIES.map((cat) => (
              <ConfigSection
                key={cat}
                category={cat}
                rows={filteredMatchedData[cat]}
                totalAnalyzed={analyzedByCategory[cat] ?? 0}
                totalScanned={filterRecords[cat].length}
                enabled={enabledCategories[cat]}
                onToggle={() => { toggleCategory(cat); }}
                expanded={categoriesExpanded[cat]}
                onExpandedChange={(v) => { setCategoriesExpanded((prev) => ({ ...prev, [cat]: v })); }}
              />
            ))}
          </>
        )}
      </Flex>

      {showDqlModal && (
        <DqlQueryModal
          query={lastServiceQuery}
          meta={lastServiceMeta}
          onClose={() => { setShowDqlModal(false); }}
        />
      )}
    </Flex>
  );
}

interface DqlQueryModalProps {
  query: string;
  meta: { count: number; ms: number } | null;
  onClose: () => void;
}

function DqlQueryModal({ query, meta, onClose }: DqlQueryModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1500);
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#111827",
          border: "1px solid #374151",
          borderRadius: 8,
          padding: 24,
          width: "min(900px, 90vw)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <strong style={{ fontSize: "1em" }}>DQL Query — Services</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {meta && (
              <span style={{ fontSize: "0.82em", color: "#6B7280" }}>
                {meta.count.toLocaleString()} records · {(meta.ms / 1000).toFixed(1)}s
              </span>
            )}
            <OutlineButton onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </OutlineButton>
            <OutlineButton onClick={onClose}>Close</OutlineButton>
          </div>
        </div>
        <pre
          style={{
            margin: 0,
            padding: 16,
            background: "#0F172A",
            border: "1px solid #1E293B",
            borderRadius: 6,
            color: "#E5E7EB",
            fontSize: "0.82em",
            fontFamily: "monospace",
            whiteSpace: "pre",
            overflowX: "auto",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {query || "No query has been executed yet."}
        </pre>
      </div>
    </div>
  );
}
