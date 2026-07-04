import { NETWORK } from "../config.js";
import { shortenAddress, stroopsToXlm } from "../lib/format.js";

const STATUS_META = {
  Funded: { label: "In escrow", cls: "funded" },
  Released: { label: "Released", cls: "released" },
  Refunded: { label: "Refunded", cls: "refunded" },
};

export default function JobCard({ job, viewer, pending, onRelease, onRefund }) {
  const meta = STATUS_META[job.status] || { label: job.status, cls: "" };
  const isClient = viewer && viewer === job.client;
  const deadlinePassed = Date.now() / 1000 > job.deadline;
  const canAct = isClient && job.status === "Funded";

  return (
    <div className="card job">
      <div className="job-head">
        <span className="job-id">#{job.id}</span>
        <span className={`pill ${meta.cls}`}>{meta.label}</span>
      </div>

      <div className="amount">{stroopsToXlm(job.amount)} XLM</div>

      <dl className="job-parties">
        <div>
          <dt>Client</dt>
          <dd>
            <a href={NETWORK.explorerAccount(job.client)} target="_blank" rel="noreferrer">
              {shortenAddress(job.client)}
            </a>
            {isClient && <span className="you">you</span>}
          </dd>
        </div>
        <div>
          <dt>Worker</dt>
          <dd>
            <a href={NETWORK.explorerAccount(job.worker)} target="_blank" rel="noreferrer">
              {shortenAddress(job.worker)}
            </a>
          </dd>
        </div>
      </dl>

      <div className="deadline muted">
        Deadline: {new Date(job.deadline * 1000).toLocaleString()}
      </div>

      {canAct && (
        <div className="job-actions">
          <button
            className="btn success sm"
            disabled={pending}
            onClick={() => onRelease(job)}
          >
            {pending ? "…" : "Release payment"}
          </button>
          <button
            className="btn danger sm"
            disabled={pending || !deadlinePassed}
            title={deadlinePassed ? "Refund yourself" : "Available after the deadline"}
            onClick={() => onRefund(job)}
          >
            Refund
          </button>
        </div>
      )}
      {!canAct && job.status === "Funded" && !isClient && (
        <div className="muted small">Only the client can release or refund.</div>
      )}
    </div>
  );
}
