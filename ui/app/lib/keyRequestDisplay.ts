export interface KeyRequestMethod {
  key_request_id: string;
  key_request_name: string;
}

export interface KeyRequestDisplay {
  /** Pair shown in the table cell; null when there are no methods. */
  displayPair: KeyRequestMethod | null;
  /** Pairs listed in the popover (all, or matched subset when filtering). */
  visiblePairs: KeyRequestMethod[];
  /**
   * Number shown in the badge.
   * 0 = no methods, 1 = single method (no badge), ≥2 = show badge.
   */
  count: number;
}

/**
 * Compute what to display in the Key Request Name / ID cells.
 *
 * When searchFilter is non-empty and at least one method matches on
 * key_request_id or key_request_name, the display is narrowed to those
 * matching methods.  Otherwise all methods are shown with the first pair
 * as the primary value.
 */
export function getKeyRequestDisplay(
  methods: KeyRequestMethod[] | null,
  searchFilter: string,
): KeyRequestDisplay {
  const all = methods ?? [];

  if (all.length === 0) {
    return { displayPair: null, visiblePairs: [], count: 0 };
  }

  const sf = searchFilter.trim().toLowerCase();

  if (sf) {
    const matched = all.filter(
      (m) =>
        m.key_request_id.toLowerCase().includes(sf) ||
        m.key_request_name.toLowerCase().includes(sf),
    );
    if (matched.length > 0) {
      return { displayPair: matched[0], visiblePairs: matched, count: matched.length };
    }
  }

  return { displayPair: all[0], visiblePairs: all, count: all.length };
}
