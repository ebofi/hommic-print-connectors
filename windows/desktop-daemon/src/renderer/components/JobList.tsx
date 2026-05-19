import React from "react";

import type { PrintJob } from "../types/daemon";

type JobListProps = {
  jobs: PrintJob[];
};

function jobBadge(status: string) {
  if (status === "printed") return { label: "Done", className: "badge-online" };
  if (status === "printing") return { label: "Printing", className: "badge-queued" };
  if (status === "claiming") return { label: "Queued", className: "badge-queued" };
  if (status === "failed") return { label: "Failed", className: "badge-offline" };
  return { label: status, className: "badge-preview" };
}

export function JobList({ jobs }: JobListProps) {
  return (
    <div className="workspace-page">
      <div className="page-header">
        <h1>Print Queue</h1>
        <p>Live job activity from the connected Hommic merchant account.</p>
      </div>
      <div className="page-body">
        <div className="section-title">Recent jobs</div>
        {jobs.length ? (
          jobs.map((job) => {
            const badge = jobBadge(job.status);
            return (
              <div className="queue-item" key={job.id}>
                <div className={`queue-status ${job.status === "failed" ? "error" : job.status === "printed" ? "done" : "printing"}`} />
                <div className="queue-copy">
                  <div className="queue-title">Job #{job.id}</div>
                  <div className="queue-meta">
                    {job.printer} | {job.status === "printed" ? "Printed successfully" : job.status === "failed" ? "Check logs for details" : "Processing"}
                  </div>
                </div>
                <span className={`badge ${badge.className}`}>{badge.label}</span>
              </div>
            );
          })
        ) : (
          <div className="empty-state">No jobs are in the queue right now.</div>
        )}
      </div>
    </div>
  );
}
