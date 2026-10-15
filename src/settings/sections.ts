import { AtSign, Compose, Cpu, Image as ImageIcon, Info, Keyboard, Palette, Plug, Sort } from "../ui/icons";

// Settings shows one section at a time, chosen from the sidebar.
export const settingsSections = [
  { id: "interaction", label: "Interaction", Icon: Keyboard },
  { id: "accounts", label: "Accounts", Icon: AtSign },
  { id: "compose", label: "Compose", Icon: Compose },
  { id: "sorting", label: "Sorting", Icon: Sort },
  { id: "connection", label: "Connection", Icon: Plug },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "branding", label: "Branding", Icon: ImageIcon },
  { id: "mcp", label: "MCP", Icon: Cpu },
  { id: "about", label: "About", Icon: Info },
] as const;
export type SettingsSection = (typeof settingsSections)[number]["id"];
