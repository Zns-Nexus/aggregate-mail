import { useId } from "react";
import { notificationDefaults, type NotificationPreferences } from "../notifications";

export function NotificationSettings({ value, onChange, onPreview }: {
  value: NotificationPreferences;
  onChange: (value: NotificationPreferences) => void;
  onPreview: () => void;
}) {
  const prefix = useId();
  return <section aria-label="Notification settings">
    <p className="note">These controls apply to floating in-app notifications. Errors and delivery warnings remain until dismissed and cannot be disabled.</p>
    <div className="settings-group">
      <label className="settings-row"><span>New mail</span><input type="checkbox" role="switch" checked={value.newMail}
        onChange={(event) => onChange({ ...value, newMail: event.target.checked })} /></label>
      <label className="settings-row"><span>Action confirmations</span><input type="checkbox" role="switch" checked={value.confirmations}
        onChange={(event) => onChange({ ...value, confirmations: event.target.checked })} /></label>
      <div className="settings-row"><label htmlFor={`${prefix}-position`}>Position</label>
        <select id={`${prefix}-position`} value={value.position} onChange={(event) => onChange({ ...value, position: event.target.value as NotificationPreferences["position"] })}>
          <option value="bottom-right">Bottom right</option><option value="bottom-center">Bottom center</option><option value="top-right">Top right</option>
        </select></div>
      <div className="settings-row"><label htmlFor={`${prefix}-duration`}>Duration</label>
        <select id={`${prefix}-duration`} value={value.duration} onChange={(event) => onChange({ ...value, duration: Number(event.target.value) as NotificationPreferences["duration"] })}>
          <option value={3000}>3 seconds</option><option value={6000}>6 seconds</option><option value={10000}>10 seconds</option><option value={0}>Until dismissed</option>
        </select></div>
    </div>
    <p className="note">New mail controls in-app arrivals. Action confirmations include successful sends. Duration applies to new information and success notices; existing notices keep their duration.</p>
    <button type="button" className="button settings-action" onClick={onPreview}>Preview notification</button>{" "}
    <button type="button" className="button settings-action" onClick={() => onChange({ ...notificationDefaults })}>Reset notification defaults</button>
  </section>;
}
