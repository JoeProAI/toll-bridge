export type Cents = number;

export function toCents(value: string | number): Cents {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`bad money value: ${value}`);
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function toValue(cents: Cents): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`bad cents: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function fmtUsd(cents: Cents): string {
  return `$${toValue(cents)}`;
}
