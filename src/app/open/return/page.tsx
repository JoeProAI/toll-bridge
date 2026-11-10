import Link from "next/link";

export default function Returned() {
  return (
    <section className="app">
      <div className="panel error-block">
        <p className="kicker">PayPal</p>
        <p className="empty-big">Hold approved.</p>
        <p>Go back to your agent. It&apos;ll authorize the hold and start working. Nothing is captured until a call passes its checks.</p>
        <Link href="/tab" className="btn btn-plum">
          Watch in the browser
        </Link>
      </div>
    </section>
  );
}
