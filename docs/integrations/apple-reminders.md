---
title: Apple Reminders
sidebar:
  label: Apple Reminders
---

Mitra cannot access Apple Reminders directly from Linux. This integration uses an iOS Shortcut as a small bridge: the Shortcut reads one Reminders list, sends its contents to Mitra, then applies Mitra's response back to the list.

## Connect Mitra

1. In Mitra, choose **Add Integration → Apple Reminders**.
2. Generate a token, copy it, and keep it private. It only authorizes this Apple Reminders integration.
3. Save the integration. It creates one task source; use one dedicated Reminders list for that source.
4. On the iPhone or iPad, create a Shortcut with **Find Reminders** limited to that list. Do not filter out completed reminders or cap the result count.
5. For each reminder, build a dictionary with `title`, `notes`, `dueDate`, `completed`, and `modifiedAt`. Put `dueDate` in ISO 8601 form; use `YYYY-MM-DD` for all-day reminders and an ISO date-time with a time zone for timed reminders. Use `null` when there is no due date.
6. Keep a stable marker in the reminder's Notes. For tasks already linked to Mitra, send `id` from a line formatted `Mitra task ID: <id>`. For a reminder not yet linked, generate a UUID, keep it in a line `Mitra client ref: <uuid>`, and send it as `clientRef`. Strip these marker lines from the `notes` value sent to Mitra; preserve the user's other notes.
7. Use **Get Contents of URL** with method `POST`, JSON body, and these headers:
   - `Authorization: Bearer <your token>`
   - `Content-Type: application/json`

   Send to:

   ```text
   https://<your-mitra-address>/api/apple-reminders/shortcut/sync
   ```

   For the local NUC setup, the address is `https://192.168.1.25:3001/api/apple-reminders/shortcut/sync`. The iPad must trust the local Caddy certificate as described in the NUC setup instructions.

   The JSON body has this shape:

   ```json
   {
     "completeSnapshot": true,
     "reminders": [
       {
         "clientRef": "<temporary UUID for an unlinked reminder>",
         "title": "Call the clinic",
         "notes": "Ask about the appointment",
         "dueDate": "2026-10-20",
         "completed": false,
         "modifiedAt": "2026-10-13T10:15:00Z"
       }
     ]
   }
   ```

8. Process the returned `tasks` array. Match a task to a reminder by its `id` marker, or by `clientRef` on the first exchange. Update its title, notes, date and completion state, then put `Mitra task ID: <returned id>` in Notes and remove the temporary client-ref line. If there is no matching reminder, create one in the selected list with those values and the ID marker.
9. To reflect deletions made in Mitra, remove any local reminder that has a Mitra ID marker not present in the returned `tasks`. Run the Shortcut manually at first; an iOS personal automation can run it on a schedule if iOS allows it.

`completeSnapshot: true` means the submitted reminders are the entire selected list, including completed items. The server then treats a linked reminder missing from that snapshot as deleted on the device. If the Shortcut cannot provide a complete list, send `false`; deletion propagation from Apple Reminders is then disabled for that run. Unlinked Mitra tasks are not deleted just because they have not yet been returned to the device.

## What syncs

- Title, notes, scheduled date/time and completion state sync in both directions.
- A date without a time becomes an all-day Mitra task. A date-time is stored as a timed task.
- Reminders run only when the Shortcut runs; this integration does not poll Apple in the background.
- Recurrence rules, subtasks, attachments, priority, tags and location are not synchronized.
- When both sides change the same task, Mitra keeps its version unless the Shortcut supplies an Apple modification time newer than the previous exchange.
- The ID marker in Notes is how the Shortcut recognizes linked tasks. Keep it in place, and do not remove the user's other note text when updating it.

The Shortcut token is sent in the HTTPS `Authorization` header, not in the URL. Regenerate it in the integration dialog if it is exposed; the old token will stop working.
