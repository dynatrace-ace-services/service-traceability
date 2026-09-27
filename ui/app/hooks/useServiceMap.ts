import { useEffect, useMemo, useState } from "react";
import { executeDql } from "../lib/dql";

export interface KeyRequestInfo {
  id: string;
  name: string;
}

export interface ServiceInfo {
  sdv: string;
  name: string;
  classicName: string;
  keyRequests?: KeyRequestInfo[];
}

const SERVICE_MAP_QUERY = `smartscapeNodes "SERVICE"
| fields id, name, dt.service_detection.version, id_classic
| lookup [fetch dt.entity.service | fields id, entity.name], sourceField:id_classic, lookupField:id, fields: { classic_name = entity.name}`;

export function useServiceMap(): { serviceMap: Map<string, ServiceInfo> } {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    let cancelled = false;
    void executeDql<Record<string, unknown>>(SERVICE_MAP_QUERY)
      .then((result) => {
        if (!cancelled) setRows(result.records);
      })
      .catch(() => {
        // best-effort enrichment — silently ignore failures
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const serviceMap = useMemo(() => {
    const map = new Map<string, ServiceInfo>();
    for (const row of rows) {
      const entityId = typeof row["id_classic"] === "string" ? row["id_classic"] : "";
      if (!entityId) continue;
      map.set(entityId, {
        sdv: typeof row["dt.service_detection.version"] === "string" ? row["dt.service_detection.version"] : "",
        name: typeof row["name"] === "string" ? row["name"] : "",
        classicName: typeof row["classic_name"] === "string" ? row["classic_name"] : "",
      });
    }
    return map;
  }, [rows]);

  return { serviceMap };
}
