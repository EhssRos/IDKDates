import type { SyncStatus } from "../../core/syncEngine";

/** A small status dot: filled when synced, a ring while syncing, red on problems. */
export function SyncDot({ status }: { status: SyncStatus }) {
  return <span className={`sync-dot ${status.kind}`} aria-hidden="true" />;
}
