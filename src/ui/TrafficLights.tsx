import { useEffect, useState } from "react";

// Windows and Linux have no traffic lights, so the window runs frameless and
// these drive it over IPC. macOS keeps its native lights.
// Guarded so the module still loads under Node for the renderer tests.
export const drawsWindowControls =
  typeof window !== "undefined" &&
  !!window.desktop &&
  window.desktop.platform !== "darwin" &&
  window.desktop.windowControls !== "windows";
// The user chose the system's own caption buttons instead (Settings, Appearance).
export const systemCaption =
  typeof window !== "undefined" &&
  !!window.desktop &&
  window.desktop.platform !== "darwin" &&
  window.desktop.windowControls === "windows";
// Drawn window controls, rendered by whichever pane header sits in the window corner.
export function TrafficLights({
  right,
  maximized,
}: {
  right?: boolean;
  maximized: boolean;
}) {
  const desktop = window.desktop;
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    setFocused(document.hasFocus());
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  if (!desktop || !drawsWindowControls) return null;
  const controls = [
    // macOS order: close (red), minimize (yellow), maximize (green).
    { command: "close", className: "close", label: "Close window" },
    { command: "minimize", className: "minimize", label: "Minimize window" },
    {
      command: "maximize",
      className: "zoom",
      label: maximized ? "Restore window" : "Maximize window",
    },
  ] as const;
  return (
    <div
      className={`traffic${right ? " right" : ""}${focused ? "" : " inactive"}`}
    >
      {controls.map((control) => (
        <button
          key={control.command}
          className={control.className}
          aria-label={control.label}
          onClick={() => desktop.windowCommand(control.command)}
        />
      ))}
    </div>
  );
}
