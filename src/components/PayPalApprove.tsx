"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRef, useState } from "react";
import { ApiError, post, type AppConfig, type TabView } from "@/lib/client/api";

interface Props {
  config: AppConfig;
  budget: string;
  onClaimed: (v: TabView) => void;
  onError: (msg: string) => void;
}

interface Opened {
  order_id: string;
  pending_token: string;
  approve_url: string | null;
}

export function PayPalApprove({ config, budget, onClaimed, onError }: Props) {
  if (config.paypal_mode === "live-sandbox" && config.paypal_client_id) {
    return <LiveButtons clientId={config.paypal_client_id} budget={budget} onClaimed={onClaimed} onError={onError} />;
  }
  return <FixtureApprove budget={budget} onClaimed={onClaimed} onError={onError} />;
}

function LiveButtons({ clientId, budget, onClaimed, onError }: { clientId: string } & Omit<Props, "config">) {
  const pending = useRef<Opened | null>(null);
  const [state, setState] = useState<"idle" | "authorizing">("idle");
  return (
    <div className="pp-live">
      <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD", components: "buttons" }}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", color: "black", label: "paypal", height: 48 }}
          forceReRender={[budget]}
          disabled={state === "authorizing"}
          createOrder={async () => {
            const o = await post<Opened>("/api/tabs", { budget });
            pending.current = o;
            return o.order_id;
          }}
          onApprove={async (data) => {
            setState("authorizing");
            try {
              onClaimed(await post<TabView>("/api/tabs/claim", { order_id: data.orderID, pending_token: pending.current?.pending_token }));
            } catch (e) {
              onError(e instanceof ApiError ? e.message : "PayPal approved the hold, but we couldn't authorize it. Try again.");
            } finally {
              setState("idle");
            }
          }}
          onCancel={() => onError("You closed PayPal before approving. No hold was placed.")}
          onError={() => onError("PayPal couldn't start. Reload and try again.")}
        />
      </PayPalScriptProvider>
      {state === "authorizing" && <p className="pp-status" role="status">Authorizing the hold with PayPal…</p>}
    </div>
  );
}

function FixtureApprove({ budget, onClaimed, onError }: Omit<Props, "config">) {
  const [step, setStep] = useState<"idle" | "creating" | "approving" | "authorizing">("idle");
  const go = async () => {
    try {
      setStep("creating");
      const o = await post<Opened>("/api/tabs", { budget });
      setStep("approving");
      const a = await post<{ pending_token: string }>("/api/fixture/approve", { pending_token: o.pending_token });
      setStep("authorizing");
      onClaimed(await post<TabView>("/api/tabs/claim", { pending_token: a.pending_token }));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Couldn't open the tab.");
    } finally {
      setStep("idle");
    }
  };
  const busy = step !== "idle";
  const label = { idle: `Approve ${budget} hold`, creating: "Creating order…", approving: "Approving…", authorizing: "Authorizing…" }[step];
  return (
    <div className="pp-fixture">
      <p className="pp-fixture-note">
        <b>Fixtures mode.</b> No real PayPal here. This stands in for a sandbox buyer approving the hold, and the money math runs on recorded PayPal shapes.
      </p>
      <button type="button" className="btn btn-big btn-plum" onClick={go} disabled={busy} aria-busy={busy}>
        {label}
      </button>
    </div>
  );
}
