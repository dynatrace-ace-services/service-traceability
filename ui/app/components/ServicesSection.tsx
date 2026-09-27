import React, { useMemo, useState } from "react";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Flex } from "@dynatrace/strato-components/layouts";
import type { ServiceRow } from "../types/scanner";
import { SdvBadge } from "./SdvBadge";

interface ServicesSectionProps {
  services: ServiceRow[];
  isLoading: boolean;
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

export function ServicesSection({ services, isLoading }: ServicesSectionProps) {
  const [expanded, setExpanded] = useState(false);

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

  const tableRows = useMemo<ServiceTableRow[]>(
    () =>
      services.map((s) => ({
        ...s,
        rowId: `${s.id}_${s.key_request_id ?? ""}_${s.name}`,
      })),
    [services],
  );

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
        accessor: "key_request_name",
        width: "2fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => (
          <span>{rowData.key_request_name ?? ""}</span>
        ),
      },
      {
        id: "key_request_id",
        header: "Key Request ID",
        accessor: "key_request_id",
        width: "2fr",
        cell: ({ rowData }: { rowData: ServiceTableRow }) => {
          const id = rowData.key_request_id ?? "";
          if (!id) return <></>;
          return <span style={{ ...MONO, wordBreak: "break-all" }}>{id}</span>;
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
      <button
        type="button"
        onClick={() => { setExpanded((v) => !v); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "0.65em", opacity: 0.65, flexShrink: 0 }}>
          {expanded ? "▼" : "▶"}
        </span>
        <strong style={{ fontSize: "0.9em", flexShrink: 0 }}>Services</strong>
        <span style={{ fontSize: "0.78em", color: "#6B7280", marginLeft: 6 }}>
          {"Total: "}
          {services.length}
          {" | SDv1: "}
          <span style={sdv1Count > 0 ? BOLD_HIGHLIGHT : undefined}>{sdv1Count}</span>
          {" | SDv2: "}
          {sdv2Count}
        </span>
      </button>

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
            <DataTable
              data={tableRows}
              columns={columns}
              sortable
              fullWidth
              rowId={(row) => row.rowId}
            />
          )}
        </div>
      )}
    </Flex>
  );
}
