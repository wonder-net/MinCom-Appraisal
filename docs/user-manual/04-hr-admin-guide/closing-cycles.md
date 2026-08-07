---
title: Closing and Finalising Cycles
section: HR Admin Guide
order: 8
roles: [hr_admin]
keywords: [close cycle, finalise, finalize, end, terminate, exclude, incomplete]
summary: End an appraisal cycle and lock in completed appraisals as the official record.
---

# Closing and Finalising Cycles

> **Role:** HR Admin

## Overview

Closing a cycle stops further submissions. Finalising marks signed-off appraisals as the official, immutable record. The two actions are separate — close the cycle when the deadline arrives, then finalise after any disputes are resolved.

## Steps

### Step 1: Open the Cycles page

Click **Cycles** in the left sidebar.

![Cycle Management table with action buttons](../../screenshots/hr-admin/02-cycles.png)

### Step 2: Close the cycle

When the cycle deadline arrives:

1. Find the cycle in the table.
2. Click **Close**.
3. Confirm in the dialog.

> ⚠️ **Warning:** Closing moves any in-progress appraisals (not yet at Signed Off or Finalised) to **Incomplete** status. Their data is preserved but they no longer count toward analytics.

### Step 3: Resolve any disputes

Open the **Reports → Dispute Log** page. Each disputed appraisal needs HR mediation:

1. Open the appraisal directly.
2. Read the rejection reason and the discussion thread.
3. Help the manager and employee reach agreement, or make an HR decision.
4. The appraisal returns to **Discussion** until both parties accept again.

### Step 4: Reopen incomplete appraisals (within 30 days)

If a manager or employee was unable to complete on time, you have a 30-day window to reopen incomplete appraisals. Open the appraisal and use the **Reopen** action — it returns to **Discussion** for completion.

### Step 5: Exclude an employee from a cycle

If an employee leaves or is on long leave during the cycle:

1. Open their appraisal.
2. Click **Exclude from cycle**.
3. Confirm.

The appraisal moves to **Excluded** status. It does not affect cycle completion rates or organisation-level analytics.

### Step 6: Finalise All

Once the cycle is closed and disputes are resolved, click **Finalise All** on the cycle row.

The platform moves every appraisal in **Signed Off** status to **Finalised**.

> ⚠️ **Warning:** Finalised appraisals cannot be edited. Make sure all sign-offs are correct first.

## What Happens Next

- A closed cycle still appears on the Cycles page and in historical analytics.
- Finalised appraisals form the official record. They show in employee profile history with a **Finalised** badge.
- All actions (close, finalise, exclude, reopen) are written to the **Audit Log**.

## Common Questions

**Q: I closed a cycle by mistake.**
A: A close cannot be undone, but you can reopen Incomplete appraisals individually within 30 days. Disputed and Signed-Off appraisals are unaffected by close.

**Q: When should I finalise?**
A: After every appraisal is either Signed Off, Excluded, or Incomplete — and any disputes are resolved. Finalising too early may leave appraisals stuck mid-workflow.

**Q: Can I delete a cycle?**
A: No. Cycles cannot be deleted — they remain on the platform as a historical record. If you created one in error, leave it in **Draft** so it never affects employees.

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Finalise All did nothing | No appraisals in Signed Off status | Check that sign-offs are complete first |
| Cannot reopen an Incomplete appraisal | More than 30 days since cycle close | The 30-day window has elapsed; the appraisal stays Incomplete permanently |
| Close button greyed out | Cycle is already Closed or in Draft | Only Active cycles can be closed |
