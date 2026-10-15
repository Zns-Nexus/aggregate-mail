// The renderer's typed call into the local mail service, and reload coalescing.
export type Api = <T>(url: string, method?: string, body?: unknown) => Promise<T>;
export type Perform = (task: () => Promise<unknown>, success?: string) => Promise<void>;

export function coalesceReload<T>(load: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | undefined;
  let pending = false;
  return () => {
    if (running) { pending = true; return running; }
    running = Promise.resolve().then(async () => {
      while (true) {
        pending = false;
        try {
          const data = await load();
          if (!pending) return data;
        } catch (error) {
          if (!pending) throw error;
        }
      }
    }).finally(() => { running = undefined; });
    return running;
  };
}
