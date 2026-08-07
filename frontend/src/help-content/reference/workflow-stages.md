---
title: Workflow Stages
section: Reference
order: 2
roles: [all]
keywords: [workflow, stages, status, transitions, state machine, lifecycle]
summary: Every stage an appraisal passes through, from Draft to Finalised.
---

# Workflow Stages

> **Role:** Everyone
> **Audience:** Employees, Managers, HR Admins

## Overview

An appraisal moves through a defined set of stages from creation to closure. Each stage shows on the appraisal form as a numbered step in the workflow progress bar. This page lists every stage and what triggers the move between them.

## The progress bar

When you open an appraisal, a strip across the top shows where you are. Completed stages are marked with a tick.

![An appraisal in Key Deliverables view — the workflow progress bar at the top shows the current stage.](../../screenshots/employee/02-appraisal-detail-key-deliverables.png)

## The stages

### 1. Draft

The appraisal exists but is not yet visible to the employee. This is the state immediately after a cycle is created and before it is activated.

### 2. Self Assessment

The employee completes the self-rating for each Key Deliverable and Competency. Skipped if the cycle has self-rating disabled (the appraisal starts directly at Manager Review in that case).

**Moves on when:** the employee submits the self-assessment.

### 3. Manager Review

The manager rates each Key Deliverable and Competency.

**Moves on when:** the manager completes all ratings and submits.

### 4. Discussion

Both parties can read each other's ratings and add comments. This stage represents the face-to-face conversation.

**Moves on when:** both parties have added at least one comment and the manager marks the discussion complete.

### 5. Growth Planning

The manager drafts the growth plan — strengths, weaknesses, training needs, career goals.

**Moves on when:** the growth plan has at least one strength, one weakness, and one training need, and the manager submits it.

### 6. Pending Sign-Off

Both the employee and the manager sign the appraisal — accept or reject.

**Moves on when:** both parties have accepted (→ **Signed Off**) or either party has rejected (→ **Disputed**).

### 7. Signed Off

Both parties have accepted. The appraisal is complete pending HR finalisation.

**Moves on when:** HR Admin clicks **Finalise All** on the cycle.

### 8. Finalised

The appraisal is closed and locked. No further changes are possible. This is the official record.

## Special statuses

### Disputed

Triggered when either party rejects at sign-off. The appraisal returns to **Discussion** with HR notified. Once the dispute is resolved and both parties accept again, the appraisal returns to **Signed Off**.

### Excluded

Set by HR Admin when an employee is removed from a cycle (for example, leaver, long-term leave). Excluded appraisals do not count toward analytics.

### Incomplete

Set automatically when an active cycle is closed and an appraisal was still in progress. Incomplete appraisals preserve their data but are excluded from analytics. HR Admin can reopen an Incomplete appraisal within 30 days of cycle close.

## Quick reference table

| Stage | Who acts | Time expected |
|-------|----------|---------------|
| Draft | HR Admin (activates cycle) | Minutes |
| Self Assessment | Appraisee | 30 to 60 minutes |
| Manager Review | Appraisor | 30 to 60 minutes per direct report |
| Discussion | Both | 30 to 60 minute meeting |
| Growth Planning | Appraisor | 15 to 25 minutes |
| Pending Sign-Off | Both | 5 minutes each |
| Signed Off | (waiting for HR) | Days |
| Finalised | HR Admin (Finalise All) | Minutes |
