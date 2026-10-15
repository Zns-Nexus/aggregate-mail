export type ComposeTemplate = { id: string; name: string; subject: string; body: string };
export type ComposePreferences = {
  templates: ComposeTemplate[];
  signatures: Record<string, string>;
};
export const emptyComposePreferences: ComposePreferences = { templates: [], signatures: {} };
