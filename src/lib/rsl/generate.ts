import { PAYOUT_ACCEPTS_TYPE, RSL_MEDIA_TYPE, RSL_NS, type RslPayee } from "./types";

export const USAGE_CHOICES = [
  { token: "ai-input", label: "AI input (answers that quote your page; this is what Toll Bridge pays for)" },
  { token: "search", label: "Search indexing" },
  { token: "ai-index", label: "AI indexing (retrieval)" },
  { token: "ai-train", label: "AI training" },
] as const;
export type UsageToken = (typeof USAGE_CHOICES)[number]["token"];

export interface LicenseInput {
  amount: string;
  payee: RslPayee;
  permits: UsageToken[];
  owner?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function validateLicense(i: LicenseInput): string | null {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(i.amount.trim()) || Number(i.amount) <= 0) return "Price per use must look like 0.05 (USD, more than zero).";
  const r = i.payee.receiver.trim();
  if (i.payee.recipient_type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) return "That PayPal email doesn't look like an email.";
  if (i.payee.recipient_type === "PAYPAL_ID" && !/^[A-Z0-9]{8,20}$/.test(r)) return "A PayPal ID is 8 to 20 capital letters and digits (it's on your PayPal account page).";
  if (!i.permits.length) return "Pick at least one use you allow.";
  return null;
}

// An RSL 1.0 file for a single page, linked from that page (<content url="">).
// Uses you don't tick are prohibited. The payout body is Toll Bridge's proposed
// media type, not part of RSL.
export function generateRsl(i: LicenseInput): string {
  const err = validateLicense(i);
  if (err) throw new Error(err);
  const prohibits = USAGE_CHOICES.map((u) => u.token).filter((t) => !i.permits.includes(t));
  const payee = JSON.stringify({ recipient_type: i.payee.recipient_type, receiver: i.payee.receiver.trim() });
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rsl xmlns="${RSL_NS}">`,
    `  <content url="">`,
    `    <license>`,
    `      <permits type="usage">${i.permits.join(" ")}</permits>`,
    ...(prohibits.length ? [`      <prohibits type="usage">${prohibits.join(" ")}</prohibits>`] : []),
    `      <payment type="use">`,
    `        <amount currency="USD">${Number(i.amount).toFixed(2)}</amount>`,
    `        <accepts type="${PAYOUT_ACCEPTS_TYPE}"><![CDATA[${payee.replace(/]]>/g, "]]]]><![CDATA[>")}]]></accepts>`,
    `      </payment>`,
    `    </license>`,
    ...(i.owner?.trim() ? [`    <copyright type="person">${esc(i.owner.trim())}</copyright>`] : []),
    `  </content>`,
    `</rsl>`,
  ];
  return lines.join("\n") + "\n";
}

export const licenseLinkTag = (href: string) => `<link rel="license" type="${RSL_MEDIA_TYPE}" href="${esc(href)}">`;
