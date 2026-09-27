import React, { useMemo, useState } from "react";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import type { ConfigurationType, FilterMatchRow } from "../types/scanner";
import { SdvBadge } from "./SdvBadge";

interface ConfigSectionProps {
  category: ConfigurationType;
  rows: FilterMatchRow[];
  totalScanned: number;
  enabled: boolean;
  onToggle: () => void;
}

const CATEGORY_LABELS: Record<ConfigurationType, string> = {
  dashboard: "Dashboards",
  notebook: "Notebooks",
  "anomaly-detection": "Anomaly Detection",
  slo: "SLOs",
  sre: "SRE Guardians",
  openpipeline: "OpenPipeline",
  workflow: "Workflows",
};

const SUB_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "0.78em",
  opacity: 0.6,
  marginTop: 1,
};

const MONO: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.9em" };

function TruncText({ text, max = 40 }: { text: string; max?: number }) {
  if (!text || text.length <= max) return <span>{text}</span>;
  return (
    <Tooltip text={text}>
      <span>{`${text.slice(0, max)}…`}</span>
    </Tooltip>
  );
}

function TruncMono({ text, max = 45 }: { text: string; max?: number }) {
  if (!text || text.length <= max) return <span style={MONO}>{text}</span>;
  return (
    <Tooltip text={text}>
      <span style={MONO}>{`${text.slice(0, max)}…`}</span>
    </Tooltip>
  );
}


interface MatchTableRow extends FilterMatchRow {
  rowId: string;
}

const BOLD_HIGHLIGHT: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--dt-colors-theme-foreground-10)",
};

function CounterSpan({ label, count, bold }: { label: string; count: number; bold: boolean }) {
  return (
    <>
      {label}
      <span style={bold ? BOLD_HIGHLIGHT : undefined}>{count}</span>
    </>
  );
}

export function ConfigSection({ category, rows, totalScanned, enabled, onToggle }: ConfigSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    const configIds = new Set<string>();
    const sdv1Configs = new Set<string>();
    const sdv2Configs = new Set<string>();
    const idConfigs = new Set<string>();
    const nameConfigs = new Set<string>();
    const classicConfigs = new Set<string>();
    const krIdConfigs = new Set<string>();
    const krNameConfigs = new Set<string>();

    for (const r of rows) {
      configIds.add(r.configuration_id);
      if (r.sdv_type === "SDv1") sdv1Configs.add(r.configuration_id);
      if (r.sdv_type === "SDv2") sdv2Configs.add(r.configuration_id);
      if (r.matched_field === "id") idConfigs.add(r.configuration_id);
      if (r.matched_field === "name") nameConfigs.add(r.configuration_id);
      if (r.matched_field === "classic_name") classicConfigs.add(r.configuration_id);
      if (r.matched_field === "key_request_id") krIdConfigs.add(r.configuration_id);
      if (r.matched_field === "key_request_name") krNameConfigs.add(r.configuration_id);
    }

    return {
      distinctConfigs: configIds.size,
      sdv1: sdv1Configs.size,
      sdv2: sdv2Configs.size,
      byId: idConfigs.size,
      byName: nameConfigs.size,
      byClassic: classicConfigs.size,
      byKrId: krIdConfigs.size,
      byKrName: krNameConfigs.size,
    };
  }, [rows]);

  const matchTableRows = useMemo<MatchTableRow[]>(
    () =>
      rows.map((r) => ({
        ...r,
        rowId: `${r.configuration_id}_${r.service_id}_${r.matched_field}_${r.matched_value}`,
      })),
    [rows],
  );

  const matchColumns = useMemo<DataTableColumnDef<MatchTableRow>[]>(
    () => [
      {
        id: "config",
        header: "Config",
        accessor: "configuration_name",
        width: "3fr",
        cell: ({ rowData }: { rowData: MatchTableRow }) => (
          <div>
            <TruncText text={rowData.configuration_name} />
            <span style={SUB_STYLE}>
              <TruncMono text={rowData.configuration_id} />
            </span>
          </div>
        ),
      },
      {
        id: "service",
        header: "Service Name",
        accessor: "service_name",
        width: "3fr",
        cell: ({ rowData }: { rowData: MatchTableRow }) => {
          const showClassic = rowData.sdv_type !== "SDv2" && rowData.classic_name && rowData.classic_name !== rowData.service_name;
          return (
            <div>
              <TruncText text={rowData.service_name} />
              {showClassic && (
                <span style={SUB_STYLE}>
                  <span style={{ opacity: 0.5, marginRight: 2 }}>Classic Name:</span>
                  {" "}
                  <TruncText text={rowData.classic_name ?? ""} />
                </span>
              )}
              <div>
                <SdvBadge type={rowData.sdv_type} />
              </div>
            </div>
          );
        },
      },
      {
        id: "service_id",
        header: "Service ID",
        accessor: "service_id",
        width: "2fr",
        cell: ({ rowData }: { rowData: MatchTableRow }) => (
          <span style={MONO}>{rowData.service_id}</span>
        ),
      },
      {
        id: "match",
        header: "Match",
        accessor: "matched_field",
        width: "2fr",
        cell: ({ rowData }: { rowData: MatchTableRow }) => (
          <div>
            <span style={{ opacity: 0.6, fontSize: "0.85em" }}>{rowData.matched_field}:</span>
            <div style={{ ...BOLD_HIGHLIGHT, fontSize: "0.85em" }}>{rowData.matched_value}</div>
          </div>
        ),
      },
      {
        id: "filter",
        header: "Filter",
        accessor: "matched_filter",
        width: "4fr",
        cell: ({ rowData }: { rowData: MatchTableRow }) => {
          const f = rowData.matched_filter;
          if (f.length <= 80) return <span style={MONO}>{f}</span>;
          return (
            <Tooltip text={f}>
              <span style={MONO}>{`${f.slice(0, 80)}…`}</span>
            </Tooltip>
          );
        },
      },
    ],
    [],
  );

  const hasRows = rows.length > 0;

  return (
    <Flex
      flexDirection="column"
      gap={0}
      style={{
        border: "1px solid #2D3748",
        borderRadius: 6,
        opacity: enabled ? 1 : 0.45,
        transition: "opacity 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          type="button"
          onClick={() => { setExpanded((v) => !v); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 12px",
            flex: 1,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            color: "inherit",
            userSelect: "none",
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: "0.65em", opacity: 0.65, flexShrink: 0 }}>
            {expanded ? "▼" : "▶"}
          </span>
          <strong style={{ fontSize: "0.9em", flexShrink: 0 }}>
            {CATEGORY_LABELS[category]}
          </strong>
          <span style={{ fontSize: "0.78em", color: "#6B7280", marginLeft: 6 }}>
            {"Total scanned: "}
            {totalScanned}
            {" | Matching filter: "}
            <span style={stats.distinctConfigs > 0 ? BOLD_HIGHLIGHT : undefined}>
              {stats.distinctConfigs}
            </span>
            {" | SDv1: "}
            <span style={stats.sdv1 > 0 ? BOLD_HIGHLIGHT : undefined}>{stats.sdv1}</span>
            {" | SDv2: "}
            {stats.sdv2}
            {" | ID: "}
            <CounterSpan label="" count={stats.byId} bold={stats.byId > 0} />
            {" | Name: "}
            <CounterSpan label="" count={stats.byName} bold={stats.byName > 0} />
            {" | Classic Name: "}
            <CounterSpan label="" count={stats.byClassic} bold={stats.byClassic > 0} />
            {" | Key Req ID: "}
            <CounterSpan label="" count={stats.byKrId} bold={stats.byKrId > 0} />
            {" | Key Req Name: "}
            <CounterSpan label="" count={stats.byKrName} bold={stats.byKrName > 0} />
          </span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          title={enabled ? "Disable this category" : "Enable this category"}
          style={{
            flexShrink: 0,
            alignSelf: "center",
            margin: "0 8px",
            padding: "3px 10px",
            background: enabled ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.12)",
            border: `1px solid ${enabled ? "#10B981" : "#6B7280"}`,
            borderRadius: 10,
            color: enabled ? "#10B981" : "#6B7280",
            fontSize: "0.75em",
            fontWeight: 600,
            cursor: "pointer",
            userSelect: "none",
            letterSpacing: "0.02em",
          }}
        >
          {enabled ? "● Enabled" : "○ Disabled"}
        </button>
      </div>

      {expanded && hasRows && (
        <div style={{ borderTop: "1px solid #2D3748", paddingLeft: 8 }}>
          <DataTable
            data={matchTableRows}
            columns={matchColumns}
            sortable
            fullWidth
            rowId={(row) => row.rowId}
          />
        </div>
      )}
    </Flex>
  );
}
