import { KIND_OPTIONS } from "../lib/types";
import { Button } from "./ui";

type KindSwitchProps = {
  value: string;
  onChange: (kind: string) => void;
  disabled?: boolean;
};

export function KindSwitch({ value, onChange, disabled }: KindSwitchProps) {
  return (
    <div className="vyaz-kind-switch" role="group" aria-label="Контекст связи">
      {KIND_OPTIONS.map((item) => (
        <Button
          key={item.id}
          size="sm"
          kind="ghost"
          aria-pressed={value === item.id}
          disabled={disabled}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
