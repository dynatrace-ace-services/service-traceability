import type { ServiceRow } from "../types/scanner";

// For id / key_request_id: any quoted occurrence is valid (IDs are unique enough).
export function matchesAsToken(filter: string, value: string): boolean {
  if (!value || value.length < 2) return false;
  return filter.includes(`"${value}"`) || filter.includes(`'${value}'`);
}

// For name-like fields (name, classic_name, key_request_name): the quoted value must
// follow a DQL key that is exactly "entity.name", exactly "name", or contains
// "service" or "request".  This prevents false positives like
// k8s.container.name == "payment-service" matching a service named "payment-service",
// while dt.smartscape.service == "payment-service" correctly matches.
export function matchesNameToken(filter: string, value: string): boolean {
  if (!value || value.length < 2) return false;
  for (const q of [`"${value}"`, `'${value}'`]) {
    let pos = 0;
    while ((pos = filter.indexOf(q, pos)) !== -1) {
      const before = filter.slice(0, pos).trimEnd();
      // Strip trailing comparison operator or argument separator (comma)
      const stripped = before
        .replace(/\s*(?:==|!=|=~|!~|<=|>=|[<>]|contains|,)\s*$/, "")
        .trimEnd();
      // Extract the last dotted identifier (e.g. "service.name", "entity.name")
      const m = stripped.match(/([a-zA-Z][\w.]*\w|[a-zA-Z]\w*)$/);
      if (m) {
        const key = m[1].toLowerCase();
        if (key === "entity.name" || key === "name" || /service|request/.test(key)) {
          return true;
        }
      }
      pos += q.length;
    }
  }
  return false;
}

export type MatchField = "id" | "name" | "classic_name" | "key_request_id" | "key_request_name";

export interface FieldMatch {
  field: MatchField;
  value: string;
  filter: string;
  keyRequestId?: string;
  keyRequestName?: string;
}

export function matchServiceToFilters(service: ServiceRow, filters: string[]): FieldMatch[] {
  const results: FieldMatch[] = [];

  const baseFields: { key: MatchField; value: string | undefined; nameOnly?: true }[] = [
    { key: "id", value: service.id },
    { key: "name", value: service.name, nameOnly: true },
    {
      key: "classic_name",
      value:
        service.classic_name && service.classic_name !== service.name
          ? service.classic_name
          : undefined,
      nameOnly: true,
    },
  ];

  for (const { key, value, nameOnly } of baseFields) {
    if (!value || value.length < 2) continue;
    const matchFn = nameOnly ? matchesNameToken : matchesAsToken;
    for (const filter of filters) {
      if (matchFn(filter, value)) {
        results.push({ field: key, value, filter });
        break;
      }
    }
  }

  for (const method of (service.service_methods ?? [])) {
    const { key_request_id: id, key_request_name: name } = method;

    if (id && id.length >= 2) {
      for (const filter of filters) {
        if (matchesAsToken(filter, id)) {
          results.push({ field: "key_request_id", value: id, filter, keyRequestId: id, keyRequestName: name });
          break;
        }
      }
    }

    if (name && name.length >= 2) {
      for (const filter of filters) {
        if (matchesNameToken(filter, name)) {
          results.push({ field: "key_request_name", value: name, filter, keyRequestId: id, keyRequestName: name });
          break;
        }
      }
    }
  }

  return results;
}
