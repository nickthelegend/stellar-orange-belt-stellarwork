import { NETWORK } from "../config.js";
import { shortenAddress, stroopsToXlm } from "../lib/format.js";

const KIND_META = {
  created: { icon: "＋", text: "Job posted", cls: "funded" },
  released: { icon: "✓", text: "Payment released", cls: "released" },
  refunded: { icon: "↩", text: "Refunded", cls: "refunded" },
};

function describe(ev) {
  const meta = KIND_META[ev.kind] || { icon: "•", text: ev.kind, cls: "" };
  let detail = "";
  const v = ev.value;
  if (ev.kind === "created" && Array.isArray(v)) {
    detail = `${stroopsToXlm(v[2])} XLM · worker ${shortenAddress(v[1])}`;
  } else if ((ev.kind === "released" || ev.kind === "refunded") && Array.isArray(v)) {
    detail = `${stroopsToXlm(v[1])} XLM · ${shortenAddress(v[0])}`;
  }
  return { meta, detail };
}

export default function ActivityFeed({ events, loading }) {
  return (
    <section className="card feed">
      <div className="feed-head">
        <h2>Live activity</h2>
        <span className="live-dot" title="Polling on-chain events">
          <i /> on-chain
        </span>
      </div>

      {loading && events.length === 0 ? (
        <p className="muted">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="muted">No on-chain events yet. Post a job to see it stream in.</p>
      ) : (
        <ul className="feed-list">
          {events.map((ev) => {
            const { meta, detail } = describe(ev);
            return (
              <li key={ev.id}>
                <span className={`ev-icon ${meta.cls}`}>{meta.icon}</span>
                <div className="ev-body">
                  <div className="ev-title">
                    {meta.text} {ev.jobId != null && <span className="muted">#{ev.jobId}</span>}
                  </div>
                  {detail && <div className="ev-detail muted">{detail}</div>}
                </div>
                {ev.txHash && (
                  <a
                    className="ev-link"
                    href={NETWORK.explorerTx(ev.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    tx ↗
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
