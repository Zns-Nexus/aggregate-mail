import type { MouseEvent, ReactNode } from "react";
import { TrafficLights, drawsWindowControls } from "../ui/TrafficLights";

/**
 * Which window controls a header carries: drawn lights on one side, room for
 * macOS's own lights, or room for the system caption buttons at the right.
 */
export type Corner = "left" | "right" | "reserve" | "caption" | null;

// A frameless window gets no automatic maximize on its caption, so pane headers restore it.
export function captionDoubleClick(event: MouseEvent) {
  if (!window.desktop || !drawsWindowControls) return;
  if ((event.target as Element).closest("button, input, a, label")) return;
  window.desktop.windowCommand("maximize");
}

/**
 * The 52px header that starts every pane. Together the headers form the
 * window's caption: they drag the window, and the one in each corner carries
 * the window controls.
 */
export function PaneHeader({ className, corner, maximized, children }: {
  className?: string;
  corner: Corner;
  maximized: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={`pane-head${className ? ` ${className}` : ""}${corner === "reserve" ? " reserve-lights" : corner === "caption" ? " reserve-caption" : ""}`}
      onDoubleClick={captionDoubleClick}>
      {corner === "left" && <TrafficLights maximized={maximized} />}
      {children}
      {corner === "right" && <TrafficLights right maximized={maximized} />}
    </header>
  );
}
