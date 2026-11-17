<div align="center">

<img src="assets/mitra.svg" alt="Mitra" width="128" />

# Mitra

**One calendar to plan your events and tasks**

[![CI](https://github.com/a11delavar/mitra/actions/workflows/qa.yml/badge.svg)](https://github.com/a11delavar/mitra/actions/workflows/qa.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-white.svg)](LICENSE)
[![Image: ghcr.io](https://img.shields.io/badge/image-ghcr.io%2Fa11delavar%2Fmitra-2496ED?logo=docker&logoColor=white)](https://github.com/a11delavar/mitra/pkgs/container/mitra)
[![Docs](https://img.shields.io/badge/docs-mitracal.com-f97316?logo=markdown&logoColor=white)](https://mitracal.com/docs/)
[![Demo](https://img.shields.io/badge/demo-demo.mitracal.com-22c55e)](https://demo.mitracal.com)

<br />
<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/week-dark.webp">
  <img src="assets/screenshots/week-light.webp" alt="Mitra's week view, with events and tasks side by side" />
</picture>

</div>

## About this edition

This is Joaquín Gale's edition of [Mitra](https://github.com/a11delavar/mitra), the calendar I plan my days with. It follows Mitra 0.8 and adds:

- **Live panel**: on wide screens, a column beside the calendar shows what is happening now (how long ago it started, how far along it is, how much is left), what comes next with a countdown, and the rest of today. Proposed upstream in [a11delavar/mitra#51](https://github.com/a11delavar/mitra/pull/51).
- **Day view**: one full-width day on the week's hour grid. See [docs/views/day.md](docs/views/day.md).
- **Todoist blocks on free plans**: Todoist's free plan holds no durations, so the official integration shows timed tasks as moments. Here Mitra keeps each task's length itself, so it stays a block on the calendar through every sync. See [docs/integrations/todoist.md](docs/integrations/todoist.md).

All credit for Mitra itself goes to [a11delavar](https://github.com/a11delavar) and its contributors. This edition is not affiliated with the official project.

### Install this edition

You need [Docker](https://www.docker.com/products/docker-desktop/). Create a folder with this `compose.yaml`:

```yaml
services:
  mitra:
    image: ghcr.io/jkngale/mitra:latest
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
    environment:
      # The update notice points at the official Mitra, which lacks this edition's additions.
      MITRA_UPDATE_CHECK: 'off'
```

Then run `docker compose up -d` in that folder and open http://localhost:3000. Everything Mitra stores is in `./data`. To update this edition, run `docker compose pull` and `docker compose up -d` again.

### En español

Esta es mi edición de Mitra, al día con la versión 0.8: añade un **panel en directo** (qué estás haciendo ahora, cuánto falta y qué viene después), **vista de día** y **bloques de Todoist en el plan gratuito** (tus tareas con hora conservan su duración en el calendario). Para instalarla, instala Docker Desktop, crea una carpeta con el `compose.yaml` de arriba, ejecuta `docker compose up -d` y abre http://localhost:3000. Tus datos quedan en la carpeta `data`.

### License

Like Mitra, this edition is licensed under the [AGPL-3.0](LICENSE). Its complete source is this repository.

---

> [!WARNING]
>
> Mitra is early and moving fast. Expect rough edges and breaking changes before `1.0`.

## Why Mitra

Most tools make you choose between a calendar for your time and a to-do app for your tasks. Mitra puts both on one timeline, so you can see when there's actually room to get things done. It runs on your own server, keeps calendars itself if you like, and connects to the ones you already have.

Want to look around first? **[Try the demo](https://demo.mitracal.com)**: you get a calendar of your own with sample entries, and nothing to install.

## Features

- Events and tasks on one timeline, in week, month, year, timeline and table views. Drag to create, move and resize anything.
- Calendars stored in Mitra itself, with no account behind them, or synced both ways with CalDAV, Google Calendar, Apple Calendar, Notion, Todoist and Tempo. Published calendar feeds come in as read-only subscriptions.
- Planning: tasks without a date wait in the Planning tab with a due date and an estimate, until you drag them into your week.
- Availability, subtasks and dependencies, files attached to entries, reminders as push notifications, guest lists with replies, and a command palette for the keyboard.
- AI connectors: Claude, Cursor and other AI tools can read and plan your calendars over the Model Context Protocol (MCP).
- Thirteen languages, right to left included, light and dark themes, and a color for every calendar.
- One small container with a database you own, no telemetry, and sign-in for several people when you need it.

## Get started

```yaml
# compose.yaml
services:
  mitra:
    image: ghcr.io/a11delavar/mitra:latest
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - ~/mitra:/app/data
    # environment:
    #   MITRA_URL: 'https://mitra.example.com' # once Mitra has a public address
```

```sh
docker compose up -d   # → http://localhost:3000
```

Out of the box, Mitra is for one person and has no sign-in. Everything it stores is in the `~/mitra` folder, so backing that up backs up everything.

From here, the **[documentation](https://mitracal.com/docs/)** covers your first calendar, connecting accounts, sign-in for several people and everything else. You can also read it as Markdown in [`docs/`](docs).

## Contributing

Issues and pull requests are welcome.
