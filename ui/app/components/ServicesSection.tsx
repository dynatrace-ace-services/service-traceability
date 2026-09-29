import React, { useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Flex } from "@dynatrace/strato-components/layouts";
import type { ServiceRow } from "../types/scanner";
import { SdvBadge } from "./SdvBadge";

interface ServicesSectionProps {
  services: ServiceRow[];
  isLoading: boolean;
  sdv1Total?: number;
  sdv2Total?: number;
  rawTotal?: number;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onShowDql: () => void;
}

const MONO: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.9em" };

const SUB_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: "0.78em",
  opacity: 0.6,
  marginTop: 1,
};

const BOLD_HIGHLIGHT: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--dt-colors-theme-foreground-10)",
};

interface ServiceTableRow extends ServiceRow {
  rowId: string;
}

const SDV_THRESHOLD = 20_000;
const ERROR_COLOR = "var(--dt-colors-feedback-negative-default, #F87171)";
const WARNING_TEXT = "Apply a filter to limit the analysis parameter.";

export function ServicesSection({ services, isLoading, sdv1Total, sdv2Total, rawTotal, expanded, onExpandedChange, pageSize, onPageSizeChange, onShowDql }: ServicesSectionProps) {
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to first page whenever the services list changes (new data or filter applied)
  useEffect(() => {
    setPageIndex(0);
  }, [services]);

  const toNum = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0;

  const sdv1Count = useMemo(
    () => services.filter((s) => toNum(s["dt.service_detection.version"]) === 1).length,
    [services],
  );
  const sdv2Count = useMemo(
    () => services.filter((s) => toNum(s["dt.service_detection.version"]) === 2).length,
    [services],
  );

  const displaySdv1 = sdv1Total ?? sdv1Count;
  const displaySdv2 = sdv2Total ?? sdv2Count;
  const totalExceeded = (rawTotal ?? services.length) >= SDV_THRESHOLD;

  const tableRows = useMemo<ServiceTableRow[]>(
    () =>
      services.map((s) => ({
        ...s,
        rowId: `${s.id}_${s.name}`,
      })),
    [services],
  );

  // Pagination info for the "Showing X–Y of N" display
  const startRow = tableRows.length === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, tableRows.length);

  const columns = useMemo<DataTableColumnDef<ServiceTableRow>[]>(
    () => [
      {
        id: "sd",
        header: "SD",
        accessor: "dt.service_detection.version",
        width: "1fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => {
          const v = toNum(rowData["dt.service_detection.version"]);
          return <SdvBadge type={v === 1 ? "SDv1" : "SDv2"} />;
        },
      },
      {
        id: "service_name",
        header: "Service Name",
        accessor: "name",
        width: "3fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => {
          const isSDv2 = toNum(rowData["dt.service_detection.version"]) === 2;
          const showClassic = !isSDv2 && rowData.classic_name && rowData.classic_name !== rowData.name;
          return (
            <div>
              <span>{rowData.name}</span>
              {showClassic && (
                <span style={SUB_STYLE}>
                  <span style={{ opacity: 0.5, marginRight: 2 }}>Classic Name:</span>
                  {" "}
                  {rowData.classic_name}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "service_id",
        header: "Service ID",
        accessor: "id",
        width: "3fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => (
          <span style={MONO}>{rowData.id}</span>
        ),
      },
      {
        id: "key_request_name",
        header: "Key Request Name",
        accessor: "service_methods",
        width: "2fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => {
          const methods = rowData.service_methods ?? [];
          return (
            <div>
              {methods.map((m, i) => (
                <div key={i}>{m.key_request_name}</div>
              ))}
            </div>
          );
        },
      },
      {
        id: "key_request_id",
        header: "Key Request ID",
        accessor: "service_methods",
        width: "2fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => {
          const methods = rowData.service_methods ?? [];
          if (!methods.length) return <></>;
          return (
            <div>
              {methods.map((m, i) => (
                <div key={i} style={{ ...MONO, wordBreak: "break-all" }}>{m.key_request_id}</div>
              ))}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <Flex
      flexDirection="column"
      gap={0}
      style={{ border: "1px solid #2D3748", borderRadius: 6 }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          type="button"
          onClick={() => { onExpandedChange(!expanded); }}
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
          <strong style={{ fontSize: "0.9em", flexShrink: 0 }}>Services</strong>
          <span style={{ fontSize: "0.78em", color: "#6B7280", marginLeft: 6 }}>
            {"Total entries: "}
            <span style={totalExceeded ? { color: ERROR_COLOR, fontWeight: 700 } : undefined}>
              {services.length.toLocaleString()}
            </span>
            {totalExceeded && (
              <span style={{ color: ERROR_COLOR, marginLeft: 6, fontStyle: "italic" }}>
                {WARNING_TEXT}
              </span>
            )}
            {" | SDv1: "}
            <span style={sdv1Count > 0 ? BOLD_HIGHLIGHT : undefined}>
              {displaySdv1.toLocaleString()}
            </span>
            {" | SDv2: "}
            <span style={sdv2Count > 0 ? BOLD_HIGHLIGHT : undefined}>
              {displaySdv2.toLocaleString()}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onShowDql}
          title="Show DQL Query"
          style={{
            flexShrink: 0,
            alignSelf: "center",
            margin: "0 8px",
            padding: "3px 10px",
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.4)",
            borderRadius: 10,
            color: "rgba(99,102,241,0.9)",
            fontSize: "0.75em",
            fontWeight: 600,
            cursor: "pointer",
            userSelect: "none",
            letterSpacing: "0.02em",
          }}
        >
          DQL
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #2D3748", paddingLeft: 8 }}>
          {isLoading && services.length === 0 ? (
            <Flex padding={12}>
              <span style={{ opacity: 0.6 }}>Loading services…</span>
            </Flex>
          ) : !isLoading && services.length === 0 ? (
            <Flex padding={12}>
              <span style={{ opacity: 0.6 }}>No service data</span>
            </Flex>
          ) : (
            <>
              <div style={{
                padding: "4px 8px",
                fontSize: "0.8em",
                color: "#6B7280",
                borderBottom: "1px solid #1F2937",
              }}>
                {`Showing ${startRow.toLocaleString()}–${endRow.toLocaleString()} of ${tableRows.length.toLocaleString()} services`}
              </div>
              <DataTable
                data={tableRows}
                columns={columns}
                sortable
                fullWidth
                rowId={(row) => row.rowId}
              >
                <DataTable.Pagination
                  pageSize={pageSize}
                  pageSizeOptions={[20, 50, 100, 500]}
                  onPageIndexChange={(newPageIndex) => { setPageIndex(newPageIndex); }}
                  onPageSizeChange={(newPageSize) => { onPageSizeChange(newPageSize); setPageIndex(0); }}
                />
              </DataTable>
            </>
          )}
        </div>
      )}
    </Flex>
  );
}
