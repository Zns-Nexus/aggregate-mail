import { useRef, useState } from "react";
import type { Category } from "../shared/types";

export type MailLocation = {
  view: Category | "snoozed" | "archive";
  accountFilter: string;
  labelFilter: string;
  query: string;
  readFilter: "all" | "unread";
  relevanceFilter: "all" | "1" | "2" | "3";
  sort: "newest" | "oldest" | "relevance";
  selectedId: string | null;
  opened: boolean;
};

export function useMailNavigation() {
  const [location, update] = useState<MailLocation>({
    view: "important", accountFilter: "all", labelFilter: "all", query: "", readFilter: "all", relevanceFilter: "all", sort: "newest", selectedId: null, opened: false,
  });
  // Keep message IDs and search text in memory, never in URLs or storage.
  const history = useRef({ entries: [location], index: 0, editingSearch: false });
  const visit = (patch: Partial<MailLocation>, search = false) => {
    const next = { ...location, ...patch };
    if (Object.keys(next).every((key) =>
      next[key as keyof MailLocation] === location[key as keyof MailLocation])) return;
    const current = history.current;
    current.entries[current.index] = location;
    current.entries = current.entries.slice(0, current.index + 1);
    if (search && current.editingSearch) current.entries[current.index] = next;
    else {
      current.entries.push(next);
      current.index++;
    }
    current.editingSearch = search;
    update(next);
  };
  const travel = (direction: -1 | 1, resolve: (location: MailLocation) => MailLocation) => {
    const current = history.current;
    const index = current.index + direction;
    if (index < 0 || index >= current.entries.length) return;
    current.entries[current.index] = location;
    current.index = index;
    current.editingSearch = false;
    update(resolve(current.entries[index]));
  };
  return {
    location, update, visit, travel,
    canBack: history.current.index > 0,
    canForward: history.current.index < history.current.entries.length - 1,
  };
}
