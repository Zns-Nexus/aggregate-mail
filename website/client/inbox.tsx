import { useMemo, useState } from "preact/hooks";
import { marks } from "../shared/logos";
import { messages, recentWith, type AccountKey, type Category, type Message } from "../shared/messages";

const accounts: { key: AccountKey; label: string; glyph: string; tile: string }[] = [
  { key: "gmail", label: "you@gmail.com", glyph: "M", tile: "#e5484d" },
  { key: "fastmail", label: "work@fastmail.com", glyph: "F", tile: "#3b6fc4" },
  { key: "yahoo", label: "me@yahoo.com", glyph: "y!", tile: "#7024de" },
];

const tabs: { key: Category; label: string }[] = [
  { key: "important", label: "Important" },
  { key: "other", label: "Other" },
  { key: "archive", label: "Archive" },
];

// Each account's share of every view, so the numbers move when the filter does.
const counts: Record<AccountKey | "all", Record<Category, number>> = {
  all: { important: 1182, other: 469, archive: 407 },
  gmail: { important: 486, other: 201, archive: 168 },
  fastmail: { important: 512, other: 188, archive: 174 },
  yahoo: { important: 184, other: 80, archive: 65 },
};

const luminance = (color: string) => {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function SenderMark({ message }: { message: Message }) {
  const mark = marks[message.domain];
  if (!mark)
    return (
      <span className="flex h-full w-full items-center justify-center rounded-full bg-[#1c1c1c] text-[10.5px] font-semibold text-[#a8a8a8]">
        {message.sender.slice(0, 1)}
      </span>
    );
  return (
    <svg aria-hidden="true" className="h-[13px] w-[13px]" viewBox={mark.viewBox}>
      {mark.paths.map((path) => {
        const color = path.fill ?? mark.fallback;
        return <path d={path.d} fill={luminance(color) < 0.24 ? "#e6e6e6" : color} key={path.d} />;
      })}
    </svg>
  );
}

function Avatar({ message, large }: { message: Message; large?: boolean }) {
  const account = accounts.find((a) => a.key === message.account)!;
  const size = large ? 38 : 22;
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex items-center justify-center rounded-full bg-[#131313]"
        style={{ width: size, height: size }}
      >
        <span style={large ? { transform: "scale(1.7)" } : undefined}>
          <SenderMark message={message} />
        </span>
      </span>
      <span
        className="absolute flex items-center justify-center rounded-full font-extrabold text-white"
        style={{
          right: -2,
          bottom: -2,
          width: large ? 15 : 10,
          height: large ? 15 : 10,
          fontSize: large ? 8.5 : 6.5,
          background: account.tile,
          boxShadow: "0 0 0 2px #0a0a0a",
        }}
      >
        {account.glyph}
      </span>
    </span>
  );
}

export function Inbox() {
  const [tab, setTab] = useState<Category>("important");
  const [account, setAccount] = useState<AccountKey | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(messages[0].id);
  const [read, setRead] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((message) => {
      if (needle) return `${message.sender} ${message.subject} ${message.preview}`.toLowerCase().includes(needle);
      if (message.category !== tab) return false;
      return account === "all" || message.account === account;
    });
  }, [tab, account, query]);

  const selected = messages.find((message) => message.id === selectedId) ?? visible[0] ?? messages[0];
  const isUnread = (message: Message) => message.unread && !read[message.id];

  const select = (message: Message) => {
    setSelectedId(message.id);
    if (message.unread) setRead((current) => ({ ...current, [message.id]: true }));
  };

  const move = (step: number) => {
    const index = visible.findIndex((message) => message.id === selected.id);
    const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
    if (next) select(next);
  };

  const tabCounts = counts[account];

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-[#0a0a0a] text-[13px] text-[#ededed] outline-none"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
      style={{ colorScheme: "dark" }}
      tabIndex={0}
    >
      <div className="flex h-10 shrink-0 items-center gap-4 border-b border-white/[0.07] px-3">
        <span aria-hidden="true" className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>

        <nav className="flex items-center gap-4">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              className="flex items-baseline gap-1.5 text-[13px] transition-colors"
              onClick={() => setTab(entry.key)}
              style={{ color: tab === entry.key && !query ? "#ededed" : "#7d7d7d", fontWeight: tab === entry.key && !query ? 600 : 400 }}
              type="button"
            >
              {entry.label}
              <span className="text-[12px] text-[#5a5a5a]">{tabCounts[entry.key]}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="rounded px-1.5 py-0.5 text-[12px] transition-colors"
            onClick={() => setAccount("all")}
            style={{ background: account === "all" ? "rgba(255,255,255,0.055)" : undefined, color: "#b4b4b4" }}
            type="button"
          >
            All
          </button>
          {accounts.map((entry, index) => (
            <button
              key={entry.key}
              className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] transition-colors hover:bg-white/[0.03]"
              onClick={() => setAccount(entry.key)}
              style={{
                background: account === entry.key ? "rgba(255,255,255,0.055)" : undefined,
                color: account === entry.key ? "#ededed" : "#7d7d7d",
              }}
              title={entry.label}
              type="button"
            >
              <span className="text-[10px] text-[#4a4a4a]">{index + 1}</span>
              <span
                className="flex h-[13px] w-[13px] items-center justify-center rounded-[3px] text-[9px] font-extrabold text-white"
                style={{ background: entry.tile }}
              >
                {entry.glyph}
              </span>
              <span className="hidden sm:inline">{entry.label}</span>
            </button>
          ))}
          <input
            aria-label="Search mail"
            className="h-6 w-[104px] rounded border border-white/[0.07] bg-white/[0.02] px-2 text-[12px] text-[#ededed] outline-none placeholder:text-[#5a5a5a] focus:border-white/20"
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            placeholder="Search mail"
            value={query}
          />
          <span className="hidden items-center gap-1.5 text-[12px] text-[#5a5a5a] lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4bb543]" />
            Synced now
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[#5a5a5a]">Nothing matches “{query}”.</p>
          ) : (
            visible.map((message, index) => {
              const previous = visible[index - 1];
              const unread = isUnread(message);
              const active = message.id === selected.id;
              return (
                <div key={message.id}>
                  {message.day !== previous?.day && (
                    <div className="px-4 pt-3.5 pb-1 text-[12px] font-medium text-[#5a5a5a]">
                      {message.day === "today" ? "Today" : "Yesterday"}
                    </div>
                  )}
                  <button
                    className="relative flex h-7 w-full items-center px-4 text-left transition-colors hover:bg-white/[0.03]"
                    onClick={() => select(message)}
                    style={{ background: active ? "rgba(255,255,255,0.055)" : undefined }}
                    type="button"
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-[2px] bg-[#6b9cff]" />}
                    <span className="mr-3.5 flex items-center">
                      <Avatar message={message} />
                    </span>
                    <span
                      className="w-[124px] shrink-0 truncate"
                      style={{ color: unread ? "#ededed" : "#b4b4b4", fontWeight: unread ? 600 : 400 }}
                    >
                      {message.sender}
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-3 overflow-hidden">
                      <span
                        className="shrink-0 whitespace-nowrap"
                        style={{ color: unread ? "#ededed" : "#b4b4b4", fontWeight: unread ? 600 : 400 }}
                      >
                        {message.subject}
                      </span>
                      <span className="hidden min-w-0 truncate text-[12px] text-[#5a5a5a] md:inline">
                        {message.preview}
                      </span>
                    </span>
                    {message.relevance === 3 && (
                      <span className="ml-3 shrink-0 text-[11px] text-[#e3a08b]">May need</span>
                    )}
                    <span className="ml-3 w-9 shrink-0 text-right text-[12px] text-[#5a5a5a]">{message.time}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <aside className="hidden w-[236px] shrink-0 border-l border-white/[0.07] px-4 py-4 lg:block">
          <div className="flex items-center gap-3">
            <Avatar large message={selected} />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[#ededed]">{selected.sender}</span>
              <span className="block truncate text-[12px] text-[#5a5a5a]">{selected.address}</span>
            </span>
          </div>
          <p className="mt-3 text-[12px] text-[#b4b4b4]">
            Writes to your {accounts.find((entry) => entry.key === selected.account)!.label}
          </p>
          <p className="mt-2 text-[12px] text-[#5a5a5a]">
            {selected.relevance === 3
              ? "High relevance"
              : selected.relevance === 2
                ? "Medium relevance"
                : "Low relevance"}
          </p>
          {selected.relevance === 3 && (
            <p className="mt-3 text-[12px] text-[#e3a08b]">{selected.reason}</p>
          )}
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <h3 className="text-[12px] font-medium text-[#7d7d7d]">Recent with {selected.sender}</h3>
            <ul className="mt-2 space-y-2">
              {recentWith(selected.sender).map((entry, index) => (
                <li className="flex items-center justify-between gap-2 text-[12px] text-[#b4b4b4]" key={entry}>
                  <span className="truncate">{entry}</span>
                  <span className="shrink-0 text-[#5a5a5a]">{[4, 4, 6][index]}d</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
