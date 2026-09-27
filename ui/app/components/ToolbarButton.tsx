import React, { useState } from "react";

// Enterprise dark palette
const T = {
  surface:     "#1A1F2E",
  border:      "#2D3748",
  borderHover: "#374151",
  text:        "#E5E7EB",
  textMuted:   "#9CA3AF",
  primaryBg:   "#1F2937",
  primaryHover:"#283244",
  sdv1Bg:      "#1F4D45",
  sdv1Text:    "#8EE7C7",
  sdv2Bg:      "#3A2E4D",
  sdv2Text:    "#C8B5FF",
};

const BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 14px",
  borderRadius: 5,
  fontSize: "0.875rem",
  fontWeight: 500,
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
  cursor: "pointer",
  outline: "none",
  transition: "background 0.1s, border-color 0.1s, color 0.1s",
};

type BaseProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

/** Primary action — dark slate, white text, subtle border */
export function PrimaryButton({ children, onClick, disabled }: BaseProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...BASE,
        background: hovered && !disabled ? T.primaryHover : T.primaryBg,
        border: `1px solid ${T.borderHover}`,
        color: T.text,
        fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Neutral secondary button — muted text, highlights only on hover */
export function OutlineButton({ children, onClick, disabled }: BaseProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...BASE,
        background: hovered && !disabled ? T.surface : "transparent",
        border: `1px solid ${hovered && !disabled ? T.borderHover : T.border}`,
        color: hovered && !disabled ? T.text : T.textMuted,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

type PillButtonProps = BaseProps & {
  active: boolean;
  accent?: "cyan" | "pink";
};

/** SDv toggle — pill shape, uses SDv color tokens when active */
export function PillButton({ children, onClick, active, accent = "cyan" }: PillButtonProps) {
  const [hovered, setHovered] = useState(false);
  const activeBg   = accent === "pink" ? T.sdv2Bg   : T.sdv1Bg;
  const activeText = accent === "pink" ? T.sdv2Text : T.sdv1Text;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...BASE,
        borderRadius: 16,
        padding: "4px 12px",
        fontSize: "0.8rem",
        fontWeight: 600,
        background: active ? activeBg : hovered ? T.surface : "transparent",
        border: `1px solid ${active ? T.borderHover : hovered ? T.borderHover : T.border}`,
        color: active ? activeText : hovered ? T.text : T.textMuted,
      }}
    >
      {children}
    </button>
  );
}
