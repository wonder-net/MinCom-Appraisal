---
title: Scoring Methodology
section: Reference
order: 1
roles: [all]
keywords: [scoring, weights, kd, bc, total, formula, calculation, balanced scorecard]
summary: How the platform calculates Key Deliverable, Competency, and Total scores.
---

# Scoring Methodology

> **Role:** Everyone
> **Audience:** Employees, Managers, HR Admins

## Overview

Every appraisal produces three scores out of 5: a **KD Average**, a **BC Average**, and a **Total Score**. This page explains exactly how each one is calculated.

## Key Deliverable score (70% of total)

Key Deliverables are grouped into four Balanced Scorecard perspectives. Each KD has:

- A **weight** (a percentage).
- A **manager rating** from 1 to 5.

The platform calculates a **Weighted Score** for every KD:

```
weighted_score = (weight / 100) × manager_rating
```

The **KD Average** is the sum of the Weighted Scores across all KDs in all four perspectives. Because the weights add up to 100%, the result is itself out of 5.

> 💡 **Tip:** The weights across all four perspectives must sum to exactly 100%. The platform blocks submission otherwise.

When self-rating is enabled, the employee provides a self-rating column too — but only the manager rating affects the score.

## Behavioural Competency score (30% of total)

Each competency has a **manager rating** from 1 to 5. Competencies that do not apply to the role are left blank.

The **BC Average** is the simple average of the manager ratings for the competencies that **were** rated. Empty competencies are excluded from the average.

The list of competencies — including which forms they appear on and their display order — is managed by HR Admin on the **Competencies** page. See [Managing Competencies](../hr-admin-guide/managing-competencies.md).

## Total Score

The Total Score combines KDs and BCs in a 70:30 ratio:

```
total_score = (kd_average × 0.7) + (bc_average × 0.3)
```

The result is again out of 5.

## Worked example

Consider an appraisal with:

- KD Average = 4.02
- BC Average = 4.13

```
total_score = (4.02 × 0.7) + (4.13 × 0.3)
            = 2.814 + 1.239
            = 4.053
```

Rounded for display: **4.05**, performance descriptor **Exceeds Expectations**.

You can see this on a real appraisal:

![Score summary showing KD Average 4.02, BC Average 4.13, Total 4.05](../../screenshots/employee/02-appraisal-detail-key-deliverables.png)

## Performance descriptor

The Total Score maps to a descriptor band — see [Performance descriptors](performance-descriptors.md) for the full table. Different descriptor labels apply to KDs and Competencies because the underlying MINCOM templates use different language for each.

## Common Questions

**Q: Why is the displayed average sometimes different from what I calculate by hand?**
A: The platform stores ratings to two decimal places and rounds at the very last step. Your hand calculation may pick up rounding differences in earlier steps.

**Q: Can the weights and ratios be changed?**
A: The 70:30 KD/BC ratio is fixed. Individual KD weights are set per appraisal and must sum to 100%. The descriptor bands themselves are configurable per cycle by HR Admin.

**Q: Where do these formulas come from?**
A: Directly from the original MINCOM Excel templates (Form A and Form B). The platform reproduces the same calculations electronically.
