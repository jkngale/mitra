---
title: Todoist
description: Sync Todoist projects and tasks with Mitra in both directions.
---

Mitra connects to Todoist using a personal API token. Each active Todoist project becomes a task source. Tasks sync in both directions: create, edit, complete, reopen and delete them in either app.

## Connect Todoist

1. In Todoist, open **Settings → Integrations → Developer** and copy the API token.
2. In Mitra, choose **Add Integration → Todoist**, paste the token, and choose **Connect**.
3. Select the Todoist projects to show, then choose **Save**. Newly discovered projects are off by default; refresh the integration after creating a project.

The API token grants access to your Todoist account. Mitra stores it with the integration and omits it from ordinary API responses. Do not share it. Revoke or replace it in Todoist if it is exposed.

## What syncs

- Todoist project tasks appear in the matching Mitra source.
- The title, description, completion state, schedule date/time, deadline, and estimate/duration map between the apps.
- Todoist's **Date** maps to Mitra's schedule (`start`/`end`); Todoist's separate **Deadline** maps to Mitra's due-date constraint.
- Mitra checks Todoist about once a minute. Completed tasks are imported from Todoist's six-week completion history; older completed entries already in Mitra are retained.
- Todoist recurring tasks keep their recurrence in Todoist. Mitra does not edit the recurrence rule; completing one in Mitra tells Todoist to complete the current occurrence.

## Limits

Todoist projects are task lists, not event calendars. Mitra therefore offers tasks only for Todoist sources. Todoist has no equivalent for Mitra availability, reminders, location, participants, relations, cancelled status, or visibility; those fields are unavailable on Todoist tasks. Mitra does not import completed tasks older than Todoist's six-week API window.

For a scheduled task with a timed start and an all-day deadline, Mitra has one all-day setting for both dates; the time/date distinction cannot be represented perfectly. Todoist's API token is an account-level credential, not a project-scoped token.

## Troubleshooting

- If the token is rejected, check **Settings → Integrations → Developer** in Todoist and create a new token if needed. Edit the integration in Mitra and enter the replacement token.
- If a project is missing, make sure it is active in Todoist, then open the integration's **⋯ → Edit** menu and choose **Refresh**.
- If task updates do not appear immediately, wait for the next synchronization cycle (about one minute).

Calendar edits are sent automatically when you finish an edit or drop a task. Further edits made while a save is pending are sent in order, with the latest placement retained. There is no need to wait for the background import interval.

Todoist accounts without native task durations still keep their calendar block lengths in Mitra. The start time synchronizes to Todoist; the end time remains local to Mitra if Todoist returns no duration. Native Todoist durations, when available, take precedence on import.
