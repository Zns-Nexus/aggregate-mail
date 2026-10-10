import { useEffect } from "preact/hooks";
import { createClient } from "lakebed/client";
import type app from "../server/index";
import { appIcon } from "../shared/logo";
import type { Provider } from "../shared/providers";
import { providers } from "../shared/providers";
import { Inbox } from "./inbox";

const client = createClient<typeof app>();

const GITHUB_REPO = "https://github.com/Zns-Nexus/aggregate-mail";
const CAFE_REPO = "https://git.cafe/screen/aggregate-mail";
const RELEASES = `${GITHUB_REPO}/releases/latest`;

// The app connects Gmail, iCloud Mail, Fastmail and Yahoo Mail, so those are the
// four marks here: two beside the window on the left, two on the right.
const left = providers.slice(0, 2);
const right = providers.slice(2);

function Mark({ provider }: { provider: Provider }) {
  return (
    <svg aria-label={provider.name} className="h-8 w-8" role="img" viewBox={provider.viewBox}>
      {provider.paths.map((path) => (
        <path d={path} fill={provider.hex} key={path} />
      ))}
    </svg>
  );
}

function Chip({ provider }: { provider: Provider }) {
  return (
    <div className="relative flex w-12 shrink-0 justify-center">
      <Mark provider={provider} />
      <span className="absolute top-full mt-2 text-[11px] leading-none whitespace-nowrap text-neutral-500">
        {provider.name}
      </span>
    </div>
  );
}

// A short lead-in from the mark to the edge of the window, so every line stays
// level with its own mark and meets the frame flush.
function Lead({ provider, towardsApp }: { provider: Provider; towardsApp: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-2 w-16 shrink-0"
      preserveAspectRatio="none"
      viewBox="0 0 100 8"
    >
      <path
        d="M 0 4 H 100"
        fill="none"
        stroke={provider.hex}
        strokeLinecap="round"
        strokeOpacity={0.4}
        strokeWidth={1.3}
      />
      <circle fill={provider.hex} r={2.8}>
        <animateMotion
          dur="3.2s"
          path={towardsApp ? "M 0 4 H 100" : "M 100 4 H 0"}
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

function StarLink({ count, href, label }: { count?: number | null; href: string; label: string }) {
  return (
    <a
      className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400 transition hover:border-neutral-600 hover:text-white"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <svg aria-hidden="true" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.6l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.62l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96z" />
      </svg>
      {label}
      {typeof count === "number" ? <span className="tabular-nums text-neutral-500">{count}</span> : null}
    </a>
  );
}

export function App() {
  const stars = client.useQuery("stars");

  useEffect(() => {
    document.title = "Emc² — mail that sorts itself";
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap";
    document.head.appendChild(font);
    return () => font.remove();
  }, []);

  return (
    <div
      className="h-dvh overflow-hidden bg-neutral-950 text-neutral-300 antialiased"
      style={{ fontFamily: 'Geist, system-ui, -apple-system, "Segoe UI", sans-serif' }}
    >
      <header className="border-b border-neutral-900">
        <div className="mx-auto flex h-16 max-w-[1544px] items-center justify-between gap-4 px-6">
          <a className="flex items-center gap-3" href={GITHUB_REPO} rel="noreferrer" target="_blank">
            <img alt="" className="h-6 w-6 rounded-md" height={256} src={appIcon} width={256} />
            <span className="text-[15px] font-medium tracking-tight text-white">Emc²</span>
          </a>
          <nav className="flex items-center gap-3 text-sm sm:gap-4">
            <a
              className="hidden text-neutral-400 transition hover:text-white sm:inline"
              href={`${GITHUB_REPO}#readme`}
              rel="noreferrer"
              target="_blank"
            >
              How it works
            </a>
            <StarLink count={stars?.github} href={GITHUB_REPO} label="GitHub" />
            <StarLink count={stars?.cafe} href={CAFE_REPO} label="git.cafe" />
          </nav>
        </div>
      </header>

      <main>
        <section className="relative px-6 pt-16 pb-10 sm:pt-24 xl:pt-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-32 h-96 bg-gradient-to-b from-neutral-800/40 via-neutral-900/20 to-transparent blur-2xl"
          />
          <div className="relative mx-auto max-w-5xl">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Mail that sorts itself, and stays on your machine.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">
              A desktop email client for Windows, macOS and Linux. Connect Gmail, iCloud, Fastmail, Yahoo or any
              IMAP server — every inbox is read, sorted and kept in one encrypted store you own.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200"
                href={RELEASES}
                rel="noreferrer"
                target="_blank"
              >
                Download for Windows
              </a>
              <a
                className="rounded-full border border-neutral-800 px-6 py-3 text-sm font-medium text-neutral-300 transition hover:border-neutral-600 hover:text-white"
                href={GITHUB_REPO}
                rel="noreferrer"
                target="_blank"
              >
                Read the source
              </a>
            </div>
            <p className="mt-4 text-xs text-neutral-500">
              Unsigned build · macOS and Linux installers on the same releases page
            </p>
          </div>
        </section>

        <section className="px-6">
          <div className="grid grid-cols-1 xl:w-auto xl:grid-cols-[124px_minmax(0,1280px)_124px] xl:justify-center">
            <div className="hidden xl:flex xl:flex-col xl:items-end xl:gap-[70px] xl:pt-12">
              {left.map((provider) => (
                <div className="flex items-center" key={provider.name}>
                  <Chip provider={provider} />
                  <Lead provider={provider} towardsApp />
                </div>
              ))}
            </div>

            <div className="mx-auto w-full max-w-[1280px] xl:mx-0 xl:w-auto xl:max-w-none">
              <div className="mb-8 flex items-start justify-between px-4 xl:hidden">
                {providers.map((provider) => (
                  <Chip key={provider.name} provider={provider} />
                ))}
              </div>
              <div className="aspect-[1280/800] overflow-hidden rounded-2xl border border-neutral-900 bg-neutral-900/40 shadow-2xl">
                <Inbox />
              </div>
            </div>

            <div className="hidden xl:flex xl:flex-col xl:items-start xl:gap-[70px] xl:pt-12">
              {right.map((provider) => (
                <div className="flex items-center" key={provider.name}>
                  <Lead provider={provider} towardsApp={false} />
                  <Chip provider={provider} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
