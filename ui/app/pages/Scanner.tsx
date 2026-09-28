import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, SegmentSelector, useSegments } from "@dynatrace/strato-components/filters";
import { SearchInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

import { useWorkflow } from "../hooks/useWorkflow";
import { executeDql } from "../lib/dql";
import { matchServiceToFilters } from "../lib/matching";
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
} from "../types/scanner";

interface StatsRow {
  sdv1: number;
  sdv2: number;
  total: number;
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
const APP_VERSION = "0.0.4";
const GITHUB_URL = "https://github.com/dynatrace-ace-services/service-traceability";
const README_URL = "https://github.com/dynatrace-ace-services/service-traceability/tree/main";
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

function exportToCsv(data: MatchData): void {
  const headers = [
    "Type", "Configuration Name", "Configuration ID",
    "Service Name", "Classic Name", "Service ID", "SDv",
    "Key Request Name", "Key Request ID",
    "Matched Field", "Matched Value", "Matched Filter",
  ];
  const rows: string[][] = [headers];

  for (const cat of ALL_CATEGORIES) {
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
  const [period, setPeriod] = useState<Period>("30d");
  const [showSdv1, setShowSdv1] = useState(true);
  const [showSdv2, setShowSdv2] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [filterRecords, setFilterRecords] = useState<FilterData>(EMPTY_FILTER_RECORDS);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [serviceWarnings, setServiceWarnings] = useState<string[]>([]);
  const [enabledCategories, setEnabledCategories] = useState<Record<ConfigurationType, boolean>>(
    () => Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<ConfigurationType, boolean>,
  );

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
        const [statsResult, servicesResult, filterResults] =
          await Promise.all([
            executeDql<StatsRow>(buildStatsQuery(period), segs).catch(() => ({ records: [] as StatsRow[], warnings: [] })),
            executeDql<ServiceRow>(buildServiceQuery(period), segs, { maxResultRecords: 20000 }).catch(() => ({
              records: [] as ServiceRow[],
              warnings: [] as string[],
            })),
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
          setFilterRecords(Object.fromEntries(filterResults as [ConfigurationType, FilterRecord[]][]) as FilterData);
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
      setLoadTrigger((t) => t + 1);
    });
  }, [enabledCategories, workflow]);

  const matchedData = useMemo<MatchData>(() => {
    if (!services.length) return EMPTY_MATCH_DATA;

    const toNum = (v: unknown) =>
      typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;

    return Object.fromEntries(
      ALL_CATEGORIES.map((cat) => {
        const records = filterRecords[cat] ?? [];
        const rows: FilterMatchRow[] = [];

        for (const record of records) {
          let filters: string[];
          try {
            filters = JSON.parse(record.filters) as string[];
          } catch {
            continue;
          }
          if (!filters.length) continue;

          for (const svc of services) {
            const fieldMatches = matchServiceToFilters(svc, filters);
            for (const fm of fieldMatches) {
              rows.push({
                configuration_id: record.configuration_id,
                configuration_name: record.configuration_name,
                service_id: svc.id,
                service_name: svc.name,
                classic_name:
                  svc.classic_name && svc.classic_name !== svc.name ? svc.classic_name : null,
                key_request_id: svc.key_request_id || null,
                key_request_name: svc.key_request_name || null,
                sdv_type: toNum(svc["dt.service_detection.version"]) === 1 ? "SDv1" : "SDv2",
                matched_field: fm.field,
                matched_value: fm.value,
                matched_filter: fm.filter,
              });
            }
          }
        }

        const seen = new Set<string>();
        const deduped = rows.filter((row) => {
          const key = `${row.configuration_id}|${row.service_id}|${row.matched_field}|${row.matched_value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return [cat, deduped] as const;
      }),
    ) as MatchData;
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
        const fields = [s.name, s.classic_name, s.id, s.key_request_id, s.key_request_name];
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

  const hasAnyData = useMemo(
    () => services.length > 0 || ALL_CATEGORIES.some((cat) => filterRecords[cat].length > 0),
    [services, filterRecords],
  );

  const totalScanned = useMemo(
    () => ALL_CATEGORIES.reduce((sum, cat) => sum + filterRecords[cat].length, 0),
    [filterRecords],
  );

  const stats = useMemo(() => {
    const sdv1 = dqlStats?.sdv1 ?? 0;
    const sdv2 = dqlStats?.sdv2 ?? 0;
    const total = dqlStats?.total ?? 0;
    const sdv1Pct = total > 0 ? Math.round((sdv1 / total) * 100) : 0;
    const sdv2Pct = total > 0 ? Math.round((sdv2 / total) * 100) : 0;
    return { sdv1, sdv2, sdv1Pct, sdv2Pct };
  }, [dqlStats]);

  const handleCsvExport = useCallback(() => {
    exportToCsv(filteredMatchedData);
  }, [filteredMatchedData]);

  const anyEnabled = ALL_CATEGORIES.some((c) => enabledCategories[c]);

  const scanButtonLabel = workflow.isRunning ? "Scanning…" : "Scan Configurations";

  const border = "1px solid #2D3748";

  const showSections = hasAnyData;

  return (
    <Flex flexDirection="column" gap={0} height="100%">

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

        {workflow.statusMessage && (
          <Text style={{ color: workflow.status === "error" ? "#FCA5A5" : "#9CA3AF" }}>
            {workflow.statusMessage}
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
              <Text><strong>{totalScanned}</strong> scan</Text>
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

            {/* Col 2 — Summary 25% */}
            <Flex flexDirection="column" gap={4} style={{ width: "25%", padding: "12px 16px 12px 4px" }}>
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

            {/* Col 3 — Quick Start 40% */}
            <Flex flexDirection="column" gap={4} style={{ width: "40%", padding: "12px 20px", fontSize: "0.875em" }}>
              <span style={{ fontSize: "0.7em", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.5, textTransform: "uppercase" }}>
                Quick Start
              </span>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>
                  Import the workflow JSON (
                  <a href={README_URL} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>README</a>
                  ).
                </li>
                <li>Enable or disable the configuration types to scan.</li>
                <li>Click &quot;Scan Configurations&quot;.</li>
                <li>Refine results using SDv1/SDv2 segments, search filters, and the selected time range.</li>
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

            <span
              style={{
                position: "absolute",
                bottom: 6,
                right: 10,
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
          </Flex>
        )}
      </Flex>

      {/* ── Results — sole scroll zone ── */}
      <Flex flexDirection="column" gap={8} padding={12} flexGrow={1} style={{ overflowY: "auto" }}>
        {isDataLoading && !showSections ? (
          <Text style={{ opacity: 0.6 }}>Loading…</Text>
        ) : !showSections ? (
          <Flex flexDirection="column" alignItems="center" padding={32}>
            <Text>No scan data yet. Click &quot;Scan Configurations&quot; to start.</Text>
          </Flex>
        ) : (
          <>
            <ServicesSection services={filteredServices} isLoading={isServicesLoading} />
            {ALL_CATEGORIES.map((cat) => (
              <ConfigSection
                key={cat}
                category={cat}
                rows={filteredMatchedData[cat]}
                totalScanned={filterRecords[cat].length}
                enabled={enabledCategories[cat]}
                onToggle={() => { toggleCategory(cat); }}
              />
            ))}
          </>
        )}
      </Flex>

    </Flex>
  );
}
