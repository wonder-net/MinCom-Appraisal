/**
 * NoCycleBanner — informational banner displayed when there is no
 * active appraisal cycle (cycle_id is null).
 */

export function NoCycleBanner() {
  return (
    <div
      className="rounded-md p-4 bg-primary-light border border-blue-300 text-sm text-blue-700 flex items-center gap-2"
      role="status"
    >
      <span aria-hidden="true">&#8505;</span>
      No active appraisal cycle. Summary data will appear once a cycle is
      in progress.
    </div>
  );
}
