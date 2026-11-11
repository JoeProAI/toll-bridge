import { kvConfig } from "../config";

// The few Redis commands the royalty ledger needs.
export interface Kv {
  readonly kind: "upstash" | "memory";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<boolean>;
  incrBy(key: string, n: number): Promise<number>;
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

export class KvError extends Error {}

// Upstash Redis REST: POST the command as a JSON array, read { result }.
export class UpstashKv implements Kv {
  readonly kind = "upstash" as const;
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok || body.error) throw new KvError(`KV ${String(args[0])} failed: ${body.error ?? res.status}`);
    return body.result as T;
  }

  get(key: string) {
    return this.cmd<string | null>("GET", key);
  }
  async set(key: string, value: string, opts: { nx?: boolean; ex?: number } = {}) {
    const args: (string | number)[] = ["SET", key, value];
    if (opts.nx) args.push("NX");
    if (opts.ex) args.push("EX", opts.ex);
    return (await this.cmd<string | null>(...args)) === "OK";
  }
  incrBy(key: string, n: number) {
    return this.cmd<number>("INCRBY", key, n);
  }
  rpush(key: string, value: string) {
    return this.cmd<number>("RPUSH", key, value);
  }
  lrange(key: string) {
    return this.cmd<string[]>("LRANGE", key, 0, -1);
  }
  async del(key: string) {
    await this.cmd<number>("DEL", key);
  }
}

// In-process stand-in for tests. TTLs are ignored.
export class MemoryKv implements Kv {
  readonly kind = "memory" as const;
  readonly data = new Map<string, string | string[]>();

  async get(key: string) {
    const v = this.data.get(key);
    return typeof v === "string" ? v : null;
  }
  async set(key: string, value: string, opts: { nx?: boolean } = {}) {
    if (opts.nx && this.data.has(key)) return false;
    this.data.set(key, value);
    return true;
  }
  async incrBy(key: string, n: number) {
    const next = Number((await this.get(key)) ?? "0") + n;
    this.data.set(key, String(next));
    return next;
  }
  async rpush(key: string, value: string) {
    const list = (this.data.get(key) as string[] | undefined) ?? [];
    list.push(value);
    this.data.set(key, list);
    return list.length;
  }
  async lrange(key: string) {
    return [...((this.data.get(key) as string[] | undefined) ?? [])];
  }
  async del(key: string) {
    this.data.delete(key);
  }
}

let shared: Kv | null | undefined;

export function kvFromEnv(): Kv | null {
  if (shared !== undefined) return shared;
  const c = kvConfig();
  shared = c ? new UpstashKv(c.url, c.token) : null;
  return shared;
}
