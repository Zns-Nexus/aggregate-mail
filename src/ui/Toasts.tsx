import { useCallback, useEffect, useRef, useState } from "react";
import { Redact } from "./Privacy";
import { Close } from "./icons";

export type Toast = { id: number; text: string; kind: "info" | "success" | "error"; eventId?: string };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const push = useCallback((text: string, kind: Toast["kind"] = "info", eventId?: string) => {
    const id = ++nextId.current;
    setToasts((current) => current.some((toast) => toast.kind === kind &&
      (eventId ? toast.eventId === eventId : !toast.eventId && toast.text === text))
      ? current : [...current, { id, text, kind, eventId }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  return { toasts, push, dismiss };
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(6000);
  useEffect(() => {
    if (toast.kind === "error" || hovered || focused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [toast.id, toast.kind, hovered, focused, onDismiss]);
  return <div className={`toast toast-${toast.kind}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div role={toast.kind === "error" ? "alert" : "status"} aria-atomic="true" className="toast-text"><Redact text={toast.text} /></div>
    <button className="icon" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}><Close size={13} color="currentColor" /></button>
  </div>;
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return <section className="toast-stack" aria-label="Notifications">
    {toasts.slice(0, 4).map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    {toasts.length > 4 && <p className="toast-pending" role="status">{toasts.length - 4} more {toasts.length === 5 ? "notification" : "notifications"}</p>}
  </section>;
}
