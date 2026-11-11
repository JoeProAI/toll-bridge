"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HoldMeter } from "./HoldMeter";
import { PayPalApprove } from "./PayPalApprove";
import { ApiError, api, post, requestQuote, type AppConfig, type Brief, type CallView, type TabView, type WringResult } from "@/lib/client/api";

const Ledger = dynamic(() => import("./Ledger"), { ssr: false, loading: () => <div className="skeleton skeleton-grid" aria-label="Loading ledger" /> });
const Royalties = dynamic(() => import("./Royalties"), { ssr: false, loading: () => <div className="skeleton skeleton-grid" aria-label="Loading royalties" /> });

type Phase = "loading" | "setup" | "open" | "closed" | "fatal";
type Stage = "quote" | "run" | null;
interface LogLine {
  id: number;
  tone: "out" | "in" | "pass" | "fail" | "note";
  text: string;
}

const cents = (v: string) => Math.round(Number(v) * 100);
const DEMO_ORDER = ["seawall", "outage", "gummies"];

export function TabApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [view, setView] = useState<TabView | null>(null);
  const [budget, setBudget] = useState("2.00");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [last, setLast] = useState<WringResult | null>(null);
  const [pick, setPick] = useState("seawall");
  const [custom, setCustom] = useState("");
  const [closing, setClosing] = useState(false);
  const [grid, setGrid] = useState<"ledger" | "royalties">("ledger");
  const lineId = useRef(0);

  const say = useCallback((tone: LogLine["tone"], text: string) => {
    setLog((l) => [...l.slice(-60), { id: ++lineId.current, tone, text }]);
  }, []);

  const boot = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const cfg = await api<AppConfig>("/api/config");
      setConfig(cfg);
      try {
        const v = await api<TabView>("/api/tab");
        setView(v);
        setPhase(v.tab.status === "closed" ? "closed" : "open");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setPhase("setup");
        else throw e;
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load Toll Bridge.");
      setPhase("fatal");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
  }, [boot]);

  const refresh = useCallback(async () => {
    const v = await api<TabView>("/api/tab");
    setView(v);
    return v;
  }, []);

  const runOne = useCallback(
    async (input: string, label: string): Promise<"ok" | "stop"> => {
      if (!config) return "stop";
      setStage("quote");
      say("out", `POST /api/tools/wring  (${label})`);
      try {
        const q = await requestQuote(input);
        say("in", `402 Payment Required. wring costs ${q.quote.price.value} USD, ${q.quote.remaining.value} left on the hold. Quote ${q.quote.quote_id}.`);
        if (q.rsl) say("note", `RSL ${q.rsl.status}${q.rsl.via ? ` (found via ${q.rsl.via})` : ""}: ${q.rsl.reason}`);
        for (const l of q.lines ?? []) if (l.kind === "royalty") say("note", `Royalty line: ${l.amount} USD to ${l.payee?.receiver}, owed only if a quote from this page passes the span check.`);
        setStage("run");
        say("out", `POST /api/tools/wring  X-Toll-Quote: ${q.quote.quote_id}`);
        say("note", `wring runs on ${config.models.generator}, then the verifier checks it.`);
        const r = await post<WringResult>("/api/tools/wring", { input }, { "x-toll-quote": q.quote_token });
        setLast(r);
        const c = r.call;
        const checks = Object.values(c.checks);
        if (c.verdict === "pass") {
          const head = `Verified: ${checks.filter(Boolean).length}/${checks.length} checks, judge ${c.score}.`;
          const roy = c.royalty?.earned ? ` Includes a ${c.royalty.amount} royalty for ${c.royalty.payee.receiver}.` : "";
          say("pass", c.capture_id ? `${head} PayPal captured ${c.charged} as ${c.capture_id} (${c.capture_status}).${roy}` : `${head} ${c.charged} added to the tab.${roy} PayPal captures the total once, at close.`);
        } else {
          say("fail", `Rejected: ${c.reasons.join("; ") || "failed checks"}. Nothing captured.`);
        }
        await refresh();
        setFresh(c.call_id);
        return "ok";
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "The call broke on our side. Nothing was charged.";
        say("fail", msg);
        if (e instanceof ApiError && (e.code === "insufficient_hold" || e.code === "tab_closed" || e.code === "tab_full")) {
          setError(msg);
          return "stop";
        }
        setError(msg);
        return "stop";
      } finally {
        setStage(null);
      }
    },
    [config, refresh, say],
  );

  const sendOne = async () => {
    if (!config || busy) return;
    setBusy(true);
    setError(null);
    const demo = config.demo_inputs.find((d) => d.id === pick);
    const input = pick === "custom" ? custom.trim() : demo?.text ?? "";
    if (!input) {
      setError("Paste some text or a URL first.");
      setBusy(false);
      return;
    }
    await runOne(input, pick === "custom" ? "your input" : demo!.label);
    setBusy(false);
  };

  const runDemo = async () => {
    if (!config || busy) return;
    setBusy(true);
    setError(null);
    say("note", "Demo agent: three calls. Two should pass, one should bounce.");
    for (const id of DEMO_ORDER) {
      const d = config.demo_inputs.find((x) => x.id === id);
      if (!d) continue;
      setPick(id);
      if ((await runOne(d.text, d.label)) === "stop") break;
    }
    setBusy(false);
  };

  const closeTab = async () => {
    if (busy) return;
    setClosing(true);
    setError(null);
    say("out", "POST /api/tab/close");
    try {
      const v = await post<TabView>("/api/tab/close");
      setView(v);
      setFresh("close");
      if (v.final_capture) say("in", `PayPal captured ${v.final_capture.amount} once as ${v.final_capture.id} (final capture). Authorization is ${v.tab.authorization_status}; the rest of the hold is released.`);
      else say("in", v.voided ? `PayPal voided ${v.tab.voided} on authorization ${v.tab.authorization_id}.` : `Nothing left to void. Authorization is ${v.tab.authorization_status}.`);
      if (v.payout?.payout_batch_id) say("in", `Royalty payout batch ${v.payout.payout_batch_id}: ${v.payout.items.map((i) => `${i.amount} to ${i.payee.receiver}`).join(", ")}.`);
      setPhase("closed");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't close the tab. Try again.");
    } finally {
      setClosing(false);
    }
  };

  const onClaimed = (v: TabView) => {
    setView(v);
    setLog([]);
    setLast(null);
    setFresh(null);
    setError(null);
    say("in", `Hold authorized. Order ${v.paypal.order_id}, authorization ${v.paypal.authorization_id}, ${v.tab.held} USD held.`);
    setPhase("open");
  };

  if (phase === "loading") return <Loading />;
  if (phase === "fatal" || !config) return <ErrorBlock message={error ?? "Something went wrong."} onRetry={boot} />;

  return (
    <div className="app">
      <ModeBar config={config} view={phase === "setup" ? null : view} />
      {error && (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {phase === "setup" && <Setup config={config} budget={budget} setBudget={setBudget} onClaimed={onClaimed} onError={setError} />}

      {(phase === "open" || phase === "closed") && view && (
        <>
          <section className="run-top">
            <div className="panel panel-meter">
              <h2 className="h-panel">{phase === "closed" ? "Tab closed" : "The hold"}</h2>
              <HoldMeter
                heldCents={cents(view.tab.held)}
                priceCents={cents(view.prices.wring ?? "0.50")}
                capturedCents={Math.max(cents(view.tab.captured), cents(view.tab.accrued ?? "0"))}
                closed={view.tab.status === "closed"}
                voidedCents={cents(view.tab.voided)}
                calls={view.calls.map((c) => ({ id: c.call_id, verdict: c.verdict, capture_id: c.capture_id ?? (c.verdict === "pass" && !c.charge_error ? "accrued" : null) }))}
                freshId={fresh}
                inflight={stage === "run" ? "run" : null}
              />
              <dl className="ids">
                <div>
                  <dt>Order</dt>
                  <dd className="mono">{view.paypal.order_id}</dd>
                </div>
                <div>
                  <dt>Authorization</dt>
                  <dd className="mono">
                    {view.paypal.authorization_id} <span className={`status status-${view.paypal.authorization_status.toLowerCase()}`}>{view.paypal.authorization_status}</span>
                  </dd>
                </div>
              </dl>
            </div>

            {phase === "open" ? (
              <AgentPanel
                config={config}
                pick={pick}
                setPick={setPick}
                custom={custom}
                setCustom={setCustom}
                busy={busy}
                stage={stage}
                onSend={sendOne}
                onDemo={runDemo}
                onClose={closeTab}
                closing={closing}
                log={log}
                remaining={view.tab.remaining}
              />
            ) : (
              <Summary view={view} onNew={() => setPhase("setup")} />
            )}
          </section>

          {last && <ResultCard r={last} />}

          <section className="panel panel-ledger" aria-labelledby="ledger-h">
            <div className="panel-head">
              <h2 id="ledger-h" className="h-panel">{grid === "ledger" ? "Ledger" : "Royalties"}</h2>
              <span className="panel-sub">{grid === "ledger" ? "Every call, its verdict, and the PayPal capture it earned. Read back from PayPal." : "What each quoted writer earned, and the PayPal payout that paid them."}</span>
            </div>
            <div className="actions" role="tablist" aria-label="Ledger view">
              {(["ledger", "royalties"] as const).map((g) => (
                <button key={g} type="button" role="tab" aria-selected={grid === g} className={`btn ${grid === g ? "btn-plum" : "btn-ghost"}`} onClick={() => setGrid(g)}>
                  {g === "ledger" ? "Calls" : "Royalties"}
                </button>
              ))}
            </div>
            {view.calls.length === 0 ? (
              <div className="empty">
                <p className="empty-big">No calls yet.</p>
                <p>Send one and it lands here with its verdict and PayPal capture ID.</p>
              </div>
            ) : (
              grid === "ledger" ? <Ledger calls={view.calls} /> : <Royalties view={view} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ModeBar({ config, view }: { config: AppConfig; view: TabView | null }) {
  return (
    <div className="modebar">
      <span className={`chip ${config.paypal_mode === "live-sandbox" ? "chip-live" : "chip-fx"}`}>
        {config.paypal_mode === "live-sandbox" ? "PayPal sandbox: live" : "PayPal: fixtures"}
      </span>
      {config.model_mode === "workers-ai" ? (
        <>
          <span className="chip">Writer model: {config.models.generator.replace("@cf/", "")}</span>
          <span className="chip">Judge model: {config.models.judge.replace("@cf/", "")}</span>
        </>
      ) : (
        <span className="chip chip-fx">Model: deterministic fake, not a real AI. Verdicts are scripted for testing.</span>
      )}
      {view && <span className="chip">Tab {view.tab.tab_id}</span>}
    </div>
  );
}

function Setup({ config, budget, setBudget, onClaimed, onError }: { config: AppConfig; budget: string; setBudget: (b: string) => void; onClaimed: (v: TabView) => void; onError: (m: string) => void }) {
  const price = config.prices.wring;
  return (
    <section className="setup">
      <div className="setup-copy">
        <p className="kicker">Step 1 of 1 for you</p>
        <h1 className="h-big">Pick a hold.</h1>
        <p className="lede">
          PayPal holds this amount on your account. Your agent can spend it only on calls that pass their checks, at {price} each. Whatever&apos;s left is voided when the tab closes.
        </p>
      </div>
      <fieldset className="budgets">
        <legend className="sr-only">Budget</legend>
        {config.budgets.map((b) => (
          <label key={b} className={`budget ${budget === b ? "is-on" : ""}`}>
            <input type="radio" name="budget" value={b} checked={budget === b} onChange={() => setBudget(b)} />
            <span className="budget-amt">
              <small>$</small>
              {b}
            </span>
            <span className="budget-sub">up to {Math.floor(Number(b) / Number(price))} calls</span>
          </label>
        ))}
      </fieldset>
      <div className="setup-tool">
        <span className="tag">Tool</span>
        <b>wring</b>
        <span>long messy text or a URL in, a brief with claims tied to exact quotes out. {price} per verified call.</span>
      </div>
      <div className="setup-pay">
        <PayPalApprove config={config} budget={budget} onClaimed={onClaimed} onError={onError} />
      </div>
    </section>
  );
}

interface AgentProps {
  config: AppConfig;
  pick: string;
  setPick: (s: string) => void;
  custom: string;
  setCustom: (s: string) => void;
  busy: boolean;
  stage: Stage;
  onSend: () => void;
  onDemo: () => void;
  onClose: () => void;
  closing: boolean;
  log: LogLine[];
  remaining: string;
}

function AgentPanel({ config, pick, setPick, custom, setCustom, busy, stage, onSend, onDemo, onClose, closing, log, remaining }: AgentProps) {
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);
  const empty = Number(remaining) < Number(config.prices.wring);
  return (
    <div className="panel panel-agent">
      <div className="panel-head">
        <h2 className="h-panel">Agent</h2>
        <span className="panel-sub">{stage === "quote" ? "Getting a quote…" : stage === "run" ? "Running and checking…" : busy ? "Working…" : "Idle"}</span>
      </div>
      <div className="inputs" role="radiogroup" aria-label="What should the agent wring?">
        {config.demo_inputs.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={pick === d.id} className={`input-chip ${pick === d.id ? "is-on" : ""}`} onClick={() => setPick(d.id)} disabled={busy}>
            <span className="input-chip-label">{d.label}</span>
            <span className={`input-chip-expect expect-${d.expect}`}>{d.expect === "pass" ? "should pass" : "should bounce"}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={pick === "custom"} className={`input-chip ${pick === "custom" ? "is-on" : ""}`} onClick={() => setPick("custom")} disabled={busy}>
          <span className="input-chip-label">Your own text or URL</span>
          <span className="input-chip-expect">you decide</span>
        </button>
      </div>
      {pick === "custom" ? (
        <textarea className="custom" rows={5} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Paste 200+ characters of text, or an https:// link" disabled={busy} aria-label="Your input" />
      ) : (
        <p className="why">{config.demo_inputs.find((d) => d.id === pick)?.why}</p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-plum" onClick={onSend} disabled={busy || empty} aria-busy={busy}>
          Send one call
        </button>
        <button type="button" className="btn btn-pink" onClick={onDemo} disabled={busy || empty}>
          Run the demo agent
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy || closing} aria-busy={closing}>
          {closing ? "Closing…" : "Close tab"}
        </button>
      </div>
      {empty && <p className="hint">The hold is used up. Close the tab to finish.</p>}
      <ol className="console" ref={logRef} aria-live="polite" aria-label="Agent log">
        {log.length === 0 ? <li className="ln ln-note">The agent&apos;s HTTP calls show up here.</li> : log.map((l) => <li key={l.id} className={`ln ln-${l.tone}`}>{l.text}</li>)}
        {stage && <li className="ln ln-wait">…</li>}
      </ol>
    </div>
  );
}

function Summary({ view, onNew }: { view: TabView; onNew: () => void }) {
  const t = view.tab;
  return (
    <div className="panel panel-summary">
      <h2 className="h-panel">The math</h2>
      <table className="math">
        <tbody>
          <tr>
            <th scope="row">Held in PayPal</th>
            <td>{t.held}</td>
          </tr>
          <tr className="math-cap">
            <th scope="row">Captured for {t.passed} verified {t.passed === 1 ? "call" : "calls"}</th>
            <td>−{t.captured}</td>
          </tr>
          <tr className="math-void">
            <th scope="row">{view.final_capture ? "Released back to the payer" : "Voided back to the payer"}</th>
            <td>{view.final_capture ? (Number(t.held) - Number(t.captured)).toFixed(2) : t.voided}</td>
          </tr>
          {view.final_capture?.paypal_fee && (
            <tr>
              <th scope="row">PayPal fee on the capture ({t.mode === "fixtures" ? "fixtures" : "sandbox reported"})</th>
              <td>{view.final_capture.paypal_fee}</td>
            </tr>
          )}
          <tr className="math-free">
            <th scope="row">Not charged for {t.failed} failed {t.failed === 1 ? "call" : "calls"}</th>
            <td>{t.not_charged}</td>
          </tr>
        </tbody>
      </table>
      <ul className="caps">
        {view.paypal.captures.map((c) => (
          <li key={c.id}>
            <Link href={`/receipt/${encodeURIComponent(c.id)}`} className="mono">
              {c.id}
            </Link>{" "}
            {c.amount} {c.status}
          </li>
        ))}
      </ul>
      <p className="panel-sub">Authorization {view.paypal.authorization_id} is {view.paypal.authorization_status}.</p>
      {view.payout && (
        <>
          <p className="panel-sub">
            Royalties: {view.payout.note} {view.payout.payout_batch_id ? `PayPal Payouts batch ${view.payout.payout_batch_id} (${view.payout.batch_status ?? "sent"}).` : ""} {view.payout.error ?? ""}
          </p>
          <ul className="caps">
            {view.payout.items.map((i) => (
              <li key={i.payout_item_id ?? i.payee.receiver}>
                <span className="mono">{i.payout_item_id ?? "pending"}</span> {i.amount} to {i.payee.receiver} {i.status ?? ""}
                {i.payout_item_fee ? ` (PayPal fee ${i.payout_item_fee})` : ""}
              </li>
            ))}
            {view.payout.accruing.map((a) => (
              <li key={a.payee.receiver}>
                {a.unpaid} accruing for {a.payee.receiver} (pays at {a.threshold})
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="btn btn-plum" onClick={onNew}>
        Open another tab
      </button>
    </div>
  );
}

function ResultCard({ r }: { r: WringResult }) {
  const brief: Brief | null = r.result ?? r.rejected_output;
  const pass = r.call.verdict === "pass";
  return (
    <section className={`panel result ${pass ? "result-pass" : "result-fail"}`} aria-labelledby="result-h">
      <div className="panel-head">
        <h2 id="result-h" className="h-panel">
          {pass ? "Last result: paid" : "Last result: bounced"}
        </h2>
        <span className={`stamp ${pass ? "stamp-paid" : "stamp-free"}`}>{pass ? `Captured ${r.call.charged}` : "Not charged"}</span>
      </div>
      <ul className="checks">
        {Object.entries(r.call.checks).map(([k, v]) => (
          <li key={k} className={v ? "ok" : "bad"}>
            {k}
          </li>
        ))}
        {r.call.score != null && <li className={pass ? "ok" : "bad"}>judge {r.call.score}</li>}
        {r.call.attempts > 1 && <li className="note">retried once</li>}
      </ul>
      {!pass && r.call.reasons.length > 0 && (
        <ul className="reasons">
          {r.call.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {brief && <BriefView brief={brief} dim={!pass} />}
    </section>
  );
}

function BriefView({ brief, dim }: { brief: Brief; dim: boolean }) {
  return (
    <article className={`brief ${dim ? "is-dim" : ""}`}>
      <h3 className="brief-title">{brief.title}</h3>
      <p className="brief-summary">{brief.summary}</p>
      <ol className="claims">
        {brief.claims?.map((c, i) => (
          <li key={i}>
            <p className="claim">{c.text}</p>
            <blockquote className="quote">
              “{c.quote}”
              <span className="span-tag">{c.span ? `chars ${c.span.start} to ${c.span.end}` : "not in the source"}</span>
            </blockquote>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Loading() {
  return (
    <div className="app" aria-busy="true">
      <div className="skeleton skeleton-bar" />
      <div className="run-top">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
      <span className="sr-only" role="status">
        Loading your tab
      </span>
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="app">
      <div className="panel error-block" role="alert">
        <p className="empty-big">That didn&apos;t load.</p>
        <p>{message}</p>
        <button type="button" className="btn btn-plum" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

export type { CallView };
