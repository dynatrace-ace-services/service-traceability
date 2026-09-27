import React from "react";

export function SdvBadge({ type }: { type: string }) {
  const isV2 = type === "SDv2";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.7em",
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: 3,
        marginTop: 3,
        background: isV2 ? "#3A2E4D" : "#1F4D45",
        color: isV2 ? "#C8B5FF" : "#8EE7C7",
        letterSpacing: "0.02em",
      }}
    >
      {type}
    </span>
  );
}
