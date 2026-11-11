import { XMLParser } from "fast-xml-parser";
import { RSL_NS } from "./types";

export interface RslTerm {
  type: string;
  values: string[];
}

export interface RslAccepts {
  type: string;
  body: string;
}

export interface RslPayment {
  type: string;
  amount?: { value: string; currency: string };
  accepts: RslAccepts[];
}

export interface RslLicense {
  permits: RslTerm[];
  prohibits: RslTerm[];
  payments: RslPayment[];
}

export interface RslContent {
  url: string;
  server?: string;
  licenses: RslLicense[];
}

export interface RslDoc {
  contents: RslContent[];
}

export class RslParseError extends Error {}

const ARRAYS = new Set(["content", "license", "permits", "prohibits", "payment", "accepts", "amount"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  cdataPropName: "#cdata",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  isArray: (name) => ARRAYS.has(name),
});

type Node = Record<string, unknown>;

function text(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n).trim();
  const o = n as Node;
  return String(o["#cdata"] ?? o["#text"] ?? "").trim();
}

function attr(n: unknown, name: string): string | undefined {
  if (!n || typeof n !== "object") return undefined;
  const v = (n as Node)[`@_${name}`];
  return v == null ? undefined : String(v).trim();
}

function list(n: unknown): Node[] {
  return Array.isArray(n) ? (n as Node[]) : n == null ? [] : [n as Node];
}

function terms(nodes: unknown): RslTerm[] {
  return list(nodes).map((t) => ({
    type: attr(t, "type") ?? "usage",
    values: text(t).split(/\s+/).filter(Boolean),
  }));
}

// The parser drops namespace declarations, so check the root start tag itself:
// <rsl xmlns="NS"> or <p:rsl xmlns:p="NS">.
function rootInRslNamespace(xml: string): boolean {
  const m = xml.match(/<(?:([A-Za-z_][\w.-]*):)?rsl\b([^>]*)>/);
  if (!m) return false;
  const decl = m[1] ? `xmlns:${m[1]}` : "xmlns";
  const v = m[2].match(new RegExp(`\\b${decl.replace(".", "\\.")}\\s*=\\s*["']([^"']*)["']`));
  return v?.[1] === RSL_NS;
}

export function parseRsl(xml: string): RslDoc {
  let tree: Node;
  try {
    tree = parser.parse(xml) as Node;
  } catch (e) {
    throw new RslParseError(`not well-formed XML: ${(e as Error).message}`);
  }
  const root = tree.rsl as Node | undefined;
  if (!root || typeof root !== "object") throw new RslParseError("no <rsl> root element");
  if (!rootInRslNamespace(xml)) throw new RslParseError(`<rsl> is not in the ${RSL_NS} namespace`);

  const contents = list(root.content).map((c): RslContent => {
    const url = attr(c, "url");
    if (url == null) throw new RslParseError("<content> without a url attribute");
    return {
      url,
      server: attr(c, "server") || undefined,
      licenses: list(c.license).map((l) => ({
        permits: terms(l.permits),
        prohibits: terms(l.prohibits),
        payments: list(l.payment).map((p) => {
          const amt = list(p.amount)[0];
          return {
            type: attr(p, "type") ?? "purchase",
            amount: amt ? { value: text(amt), currency: (attr(amt, "currency") ?? "").toUpperCase() } : undefined,
            accepts: list(p.accepts).map((a) => ({ type: attr(a, "type") ?? "", body: text(a) })),
          };
        }),
      })),
    };
  });
  return { contents };
}
