import Link from "next/link";
import { LandingReplay } from "@/components/LandingReplay";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">A PayPal tab for AI agents</p>
          <h1 className="h-hero">
            Give your agent a tab, <em>not your card.</em>
          </h1>
          <p className="lede">
            Approve one PayPal hold. Your agent pays per tool call out of it, and PayPal only captures a toll when the result passes its checks. Failed calls cost nothing. What&apos;s left is voided when the tab closes.
          </p>
          <div className="hero-cta">
            <Link href="/tab" className="btn btn-big btn-plum">
              Open a $2 tab
            </Link>
            <Link href="#agents" className="btn btn-big btn-ghost">
              Point an agent at it
            </Link>
          </div>
        </div>
        <div className="hero-meter">
          <LandingReplay />
        </div>
      </section>

      <section id="how" className="stubs" aria-labelledby="how-h">
        <h2 id="how-h" className="h-section">
          Three PayPal calls. <span className="ink-pink">Zero trust needed.</span>
        </h2>
        <ol className="stub-row">
          <li className="stub">
            <span className="stub-n">01</span>
            <h3>Hold</h3>
            <p>You approve one budget in PayPal. It&apos;s an authorization, so the money is held, not spent.</p>
            <code>Orders v2, intent: AUTHORIZE</code>
          </li>
          <li className="stub stub-pink">
            <span className="stub-n">02</span>
            <h3>Earn</h3>
            <p>Each call gets a quote, runs, then faces a verifier: schema, exact source quotes, coverage, and an LLM judge. Pass, and PayPal captures that one toll. Fail, and nothing moves.</p>
            <code>capture, final_capture: false</code>
          </li>
          <li className="stub stub-cobalt">
            <span className="stub-n">03</span>
            <h3>Void</h3>
            <p>Close the tab and the rest of the hold goes back. Every cent captured has a receipt with its PayPal ID.</p>
            <code>authorizations/{"{id}"}/void</code>
          </li>
        </ol>
      </section>

      <section className="why-row" aria-label="Why">
        <p className="why-big">
          Agents that spend money today get either your whole card, or a human clicking approve on every charge. <b>Toll Bridge is the middle: approve once, pay only for work that checks out.</b>
        </p>
      </section>

      <section id="agents" className="agents" aria-labelledby="agents-h">
        <h2 id="agents-h" className="h-section">For agents</h2>
        <div className="agent-cols">
          <div className="panel">
            <h3 className="h-panel">Plain HTTP</h3>
            <p className="panel-sub">Ask, get a 402 with a quote, pay with the quote.</p>
            <pre className="code">{`curl -X POST $HOST/api/tools/wring \\
  -H "authorization: Bearer $TAB" \\
  -d '{"input":"https://example.com/long-page"}'
# 402 { quote: { price: "0.50" }, quote_token }

curl -X POST $HOST/api/tools/wring \\
  -H "authorization: Bearer $TAB" \\
  -H "x-toll-quote: $QUOTE" \\
  -d '{"input":"https://example.com/long-page"}'
# 200 { call: { verdict, capture_id }, result }`}</pre>
          </div>
          <div className="panel">
            <h3 className="h-panel">MCP</h3>
            <p className="panel-sub">Streamable HTTP. Tools: open, claim, quote, wring, status, close.</p>
            <pre className="code">{`{
  "mcpServers": {
    "toll-bridge": {
      "url": "https://<host>/api/mcp"
    }
  }
}`}</pre>
            <p className="panel-sub">
              The human step is approving the hold. Everything after that is the agent&apos;s. <Link href="/tab">Open a tab</Link> to try it in the browser.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
