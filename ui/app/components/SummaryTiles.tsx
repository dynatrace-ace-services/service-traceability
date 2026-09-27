import React, { useMemo } from "react";
import { SingleValue } from "@dynatrace/strato-components/charts";
import { Flex } from "@dynatrace/strato-components/layouts";
import type { SmartscapeRow } from "../types/scanner";

interface SummaryTilesProps {
  rows: SmartscapeRow[];
}

export function SummaryTiles({ rows }: SummaryTilesProps) {
  const stats = useMemo(() => {
    const total = rows.length;
    const sdv1 = rows.filter((r) => r.type === "SDv1").length;
    const sdv2 = rows.filter((r) => r.type === "SDv2").length;
    const sdv1Pct = total > 0 ? Math.round((sdv1 / total) * 100) : 0;
    const sdv2Pct = total > 0 ? Math.round((sdv2 / total) * 100) : 0;
    return { total, sdv1, sdv2, sdv1Pct, sdv2Pct };
  }, [rows]);

  return (
    <Flex flexDirection="row" gap={16} flexWrap="wrap" paddingTop={8} paddingBottom={8}>
      <Tile label="Service refs" value={stats.total} />
      <Tile label="SDv1" value={stats.sdv1} />
      <Tile label="SDv2" value={stats.sdv2} />
      <Tile label="SDv1 %" value={`${stats.sdv1Pct}%`} />
      <Tile label="SDv2 %" value={`${stats.sdv2Pct}%`} />
    </Flex>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ width: 160, height: 100 }}>
      <SingleValue data={value} label={label} />
    </div>
  );
}
