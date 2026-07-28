# Hexo Local Admin

`admin/` is a local-only management panel for this Hexo project. It binds to
`127.0.0.1:4190` and manages only the surrounding Hexo repository.

## Start

On Windows, double-click `start_databoard.cmd` in the project root. Reopening
the script detects an existing panel and only opens the browser.

From a terminal:

```bash
npm install
npm --prefix admin install
npm run admin:build
npm run admin:start
```

Open <http://127.0.0.1:4190>. Keep the terminal running; press `Ctrl+C` to
stop the admin panel.

For admin development with hot reload:

```bash
npm run admin:dev
```

## Daily workflow

1. Create or edit a post in **Posts**. The editor writes Markdown source after
   a two-second debounce; `Ctrl/Cmd+S` saves immediately.
2. Use **Publish → Start preview** to run Hexo locally. Stop it from the same
   page when finished.
3. Review the Git working tree and diff in **Git**, then commit and push source
   changes to the `hexo` branch.
4. Use **Publish → Deploy to main** only after the source has been reviewed.
   The panel checks configuration, Front Matter and the Git working tree before
   it runs `hexo clean`, `hexo generate`, then `hexo deploy`.

`hexo` contains source files and the admin code. Hexo deployment publishes the
generated site to `main`; do not manually mix source commits into `main`.

## Recovery data

The panel stores local-only metadata in `.hexo-admin/`, which is ignored by
Git:

- `recycle-bin/` — deleted content awaiting restore or permanent deletion
- `snapshots/` — up to ten recent pre-save versions per content file
- `backups/` — YAML configuration backups
- `logs/operations.jsonl` — local operation log

## Verification

```bash
npm run admin:build
npm run admin:test
```

The test suite covers path restriction, Front Matter preservation, atomic file
writes, conflict detection, recovery, taxonomy updates, media operations,
configuration protection and deployment readiness checks.
