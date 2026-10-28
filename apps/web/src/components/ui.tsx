import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type ButtonKind = "coral" | "ink" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: ButtonKind;
  size?: ButtonSize;
};

export function Button({ kind = "coral", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={`vyaz-btn vyaz-btn--${kind} vyaz-btn--${size} ${className}`.trim()} {...props} />;
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Field({ label, id, className = "", ...props }: FieldProps) {
  return (
    <label className={`vyaz-field ${className}`.trim()} htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };

export function TextAreaField({ label, id, className = "", ...props }: AreaProps) {
  return (
    <label className={`vyaz-field ${className}`.trim()} htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} {...props} />
    </label>
  );
}

type Option = { id: string; label: string };

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  label: string;
  items: Option[];
  valueId: string;
  onValue: (id: string) => void;
};

export function SelectField({ label, id, items, valueId, onValue, className = "", ...props }: SelectProps) {
  return (
    <label className={`vyaz-field ${className}`.trim()} htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={valueId} onChange={(event) => onValue(event.target.value)} {...props}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Notice({ title, children, kind = "error" }: { title: string; children?: ReactNode; kind?: "error" | "info" }) {
  return (
    <div className={`vyaz-notice vyaz-notice--${kind}`} role="status">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

type DialogProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryDisabled?: boolean;
  danger?: boolean;
  onClose: () => void;
  onPrimary: () => void;
  onSecondary?: () => void;
};

export function Dialog({
  open,
  title,
  children,
  primaryLabel,
  secondaryLabel = "Отмена",
  primaryDisabled,
  danger,
  onClose,
  onPrimary,
  onSecondary,
}: DialogProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="vyaz-dialog" role="dialog" aria-modal="true" aria-labelledby="vyaz-dialog-title">
      <button type="button" className="vyaz-dialog__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="vyaz-dialog__card">
        <h2 id="vyaz-dialog-title">{title}</h2>
        <div className="vyaz-dialog__body">{children}</div>
        <div className="vyaz-dialog__actions">
          <Button kind="ghost" onClick={onSecondary ?? onClose}>
            {secondaryLabel}
          </Button>
          <Button kind={danger ? "danger" : "ink"} onClick={onPrimary} disabled={primaryDisabled}>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg className={`vyaz-logo ${className}`.trim()} viewBox="0 0 32 28" width="28" height="24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.2 4.2c2.4-2.2 5.6-1.6 7.8.6 2.2-2.2 5.4-2.8 7.8-.6 2.6 2.4 2.4 6.4.2 9.2L16 26 8 13.4C5.8 10.6 5.6 6.6 8.2 4.2Z"
      />
      <path
        fill="currentColor"
        opacity="0.55"
        d="M16 6.4c1.2-1.4 3.1-1.8 4.5-.6 1.6 1.4 1.5 3.7.1 5.4L16 17.8 11.4 11.2C10 9.5 9.9 7.2 11.5 5.8 12.9 4.6 14.8 5 16 6.4Z"
      />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M4 6h10m-8 0 .4 8.2A1.5 1.5 0 0 0 7.9 15.5h2.2a1.5 1.5 0 0 0 1.5-1.3L12 6M7 6V4.6A1.6 1.6 0 0 1 8.6 3h.8A1.6 1.6 0 0 1 11 4.6V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8M11 13.5 15 10l-4-3.5M15 10H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
