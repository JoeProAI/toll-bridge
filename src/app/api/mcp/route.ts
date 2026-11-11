import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { PayPalApiError } from "@/lib/paypal/client";
import { TollError } from "@/lib/tab/engine";
import { opClaim, opClose, opFixtureApprove, opOpen, opQuote, opRslCheck, opStatus, opWring } from "@/server/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Out = { content: { type: "text"; text: string }[]; isError?: boolean };

async function wrap(fn: () => Promise<unknown>): Promise<Out> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    const err =
      e instanceof TollError
        ? { code: e.code, status: e.status, message: e.message, ...e.extra }
        : e instanceof PayPalApiError
          ? { code: "paypal_error", status: e.status, issue: e.issue, debug_id: e.debugId }
          : { code: "internal", message: "Something broke. Nothing was charged." };
    return { content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }], isError: true };
  }
}

const tab = z.string().describe("tab_token from toll_claim_tab or the last paid call. Always use the newest one.");

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "toll_open_tab",
      {
        title: "Open a PayPal-backed tab",
        description:
          "Creates a PayPal AUTHORIZE order for a budget. A human must approve the hold at approve_url (the only human step). Then call toll_claim_tab.",
        inputSchema: z.object({ budget: z.string().regex(/^\d+(\.\d{1,2})?$/).default("5.00").describe("USD, e.g. 5.00") }),
      },
      async ({ budget }) => wrap(() => opOpen(budget)),
    );
    server.registerTool(
      "toll_fixture_approve",
      {
        title: "Approve a fixture hold",
        description: "Fixtures mode only: stands in for the payer approving in PayPal. Fails on real sandbox holds.",
        inputSchema: z.object({ pending_token: z.string() }),
      },
      async ({ pending_token }) => wrap(() => opFixtureApprove(pending_token)),
    );
    server.registerTool(
      "toll_claim_tab",
      {
        title: "Claim the approved tab",
        description: "Authorizes the approved PayPal order and returns tab_token. Returns awaiting_approval if the payer hasn't approved yet.",
        inputSchema: z.object({ pending_token: z.string() }),
      },
      async ({ pending_token }) => wrap(() => opClaim(pending_token)),
    );
    server.registerTool(
      "toll_quote",
      {
        title: "Quote a paid call",
        description:
          "Price check for wring on this input: the tool fee plus a royalty line when the page's RSL 1.0 license asks for payment per use. Pages whose license prohibits AI input are refused at 0.00. Returns a quote_token for toll_wring. Nothing is charged.",
        inputSchema: z.object({ tab_token: tab, input: z.string().describe("Long text or an http(s) URL") }),
      },
      async ({ tab_token, input }) => wrap(() => opQuote(tab_token, input)),
    );
    server.registerTool(
      "toll_rsl_check",
      {
        title: "Check a page's RSL license",
        description:
          "Finds and reads the RSL 1.0 license for a URL (HTTP Link header, HTML <link rel=license>, robots.txt) and says whether Toll Bridge may use it as AI input and what royalty it asks. Free.",
        inputSchema: z.object({ url: z.string().url() }),
      },
      async ({ url }) => wrap(() => opRslCheck(url)),
    );
    server.registerTool(
      "toll_wring",
      {
        title: "Wring a source into a verified brief (paid)",
        description:
          "Turns long messy text into a brief with claims tied to exact source quotes. A verifier checks it. PayPal captures the quoted price only if it passes; a failed call costs nothing.",
        inputSchema: z.object({ tab_token: tab, quote_token: z.string(), input: z.string().describe("Same input you quoted") }),
      },
      async ({ tab_token, quote_token, input }) => wrap(() => opWring(tab_token, quote_token, input)),
    );
    server.registerTool(
      "toll_tab_status",
      {
        title: "Tab status",
        description: "Held, captured and remaining amounts, read back from PayPal, plus every call and its verdict.",
        inputSchema: z.object({ tab_token: tab }),
      },
      async ({ tab_token }) => wrap(() => opStatus(tab_token)),
    );
    server.registerTool(
      "toll_close_tab",
      {
        title: "Close the tab",
        description:
          "Settles the tab: one PayPal capture for the verified calls (tab mode), the rest of the hold goes back to the payer, and writers' royalties are paid with PayPal Payouts.",
        inputSchema: z.object({ tab_token: tab }),
      },
      async ({ tab_token }) => wrap(() => opClose(tab_token)),
    );
  },
  { serverInfo: { name: "toll-bridge", version: "0.1.0" } },
);

export { handler as GET, handler as POST };
