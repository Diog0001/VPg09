import type { CSSProperties } from "react";

export function TypeBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span className="vyaz-type" style={{ "--vyaz-type-color": color ?? "#fb605e" } as CSSProperties}>
      {label}
    </span>
  );
}
