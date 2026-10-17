"use client";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { LoaderCircle, X, CheckCircle2, AlertCircle } from "lucide-react";
export function Busy({ children = "جاري التحميل" }: { children?: ReactNode }) {
  return (
    <span className="busy">
      <LoaderCircle size={17} className="spin" aria-hidden="true" />
      {children}
    </span>
  );
}
export function Notice({
  text,
  success = false,
}: {
  text: string;
  success?: boolean;
}) {
  return text ? (
    <div
      className={`notice ${success ? "success" : ""}`}
      role={success ? "status" : "alert"}
    >
      {success ? (
        <CheckCircle2 size={19} aria-hidden="true" />
      ) : (
        <AlertCircle size={19} aria-hidden="true" />
      )}
      <span>{text}</span>
    </div>
  ) : null;
}
export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <CheckCircle2 size={32} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
    >
      <header className="modal-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={locked}
          aria-label="إغلاق"
        >
          <X size={22} />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
