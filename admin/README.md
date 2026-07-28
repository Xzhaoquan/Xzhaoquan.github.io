# Hexo Local Admin

This is a local-only management UI for this Hexo project.  The service binds to
`127.0.0.1:4190` and only accepts files below the selected Hexo project root.

## Run on Windows

From the repository root:

```powershell
cd admin
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:4173` during development.  The Vite development server
proxies API requests to the local Fastify service at port `4190`.

For a production-style local run:

```powershell
cd admin
npm.cmd run build
npm.cmd start
```

Then open `http://127.0.0.1:4190`.

Set `HEXO_PROJECT_ROOT` only when managing another valid local Hexo project.
It must contain both `_config.yml` and `package.json`.

## Branch model

- Commit posts, themes, configuration and `admin/` source to **`hexo`**.
- Use **Publish → Deploy** (or `hexo deploy`) only to publish generated static
  files to **`main`**.  Do not edit `main` as source content.

## Safety model

- File paths are normalized, checked against the project root and reject
  traversal, blocked directories and symlink escapes.
- Destructive content operations go to `.hexo-admin/recycle-bin/` first.
- YAML changes are parsed and backed up before atomic replacement.
- Posts autosave after two seconds and store a source snapshot before writing.
- Task execution and Git commands use fixed allowlists; the UI cannot execute
  arbitrary shell commands.

`.hexo-admin/` contains local backups, snapshots and JSONL activity logs and
is ignored by Git.
