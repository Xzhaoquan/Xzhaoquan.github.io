import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './style.css';

type Kind = 'post' | 'draft' | 'page';
type Document = { kind: Kind; path: string; title: string; data: Record<string, unknown>; body: string; mtimeMs: number; hash: string };
type Task = { id: string; type: string; status: string; startedAt: string; stdout: string; stderr: string };
type Status = { root: string; theme: string; posts: number; drafts: number; pages: number; categories: number; tags: number; branch: string; changedFiles: number; preview: { port: number; url: string } | null; recentTasks: Task[] };
type View = 'dashboard' | 'posts' | 'drafts' | 'taxonomy' | 'pages' | 'media' | 'config' | 'theme' | 'publish' | 'git' | 'logs';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? 'Operation failed.');
  return payload.data as T;
}

const nav: Array<[View, string, string]> = [
  ['dashboard', 'Dashboard', '◆'], ['posts', 'Posts', '▣'], ['drafts', 'Drafts', '▤'], ['taxonomy', 'Categories & tags', '◇'], ['pages', 'Pages', '▧'], ['media', 'Media', '▦'], ['config', 'Configuration', '⚙'], ['theme', 'Theme', '◈'], ['publish', 'Publish', '↗'], ['git', 'Git', '◌'], ['logs', 'Activity log', '◫']
];

function MarkdownEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({ doc: latest.current, extensions: [lineNumbers(), markdown(), keymap.of([...defaultKeymap, indentWithTab]), EditorView.lineWrapping, EditorView.updateListener.of(update => { if (update.docChanged) { latest.current = update.state.doc.toString(); callback.current(latest.current); } })] }),
      parent: host.current
    });
    return () => view.destroy();
  }, []);
  useEffect(() => { latest.current = value; }, [value]);
  return <div className="markdown" ref={host} aria-label="Markdown editor" />;
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [status, setStatus] = useState<Status | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [editor, setEditor] = useState<Document | null>(null);
  const [taxonomy, setTaxonomy] = useState<{ categories: Array<{ name: string; count: number }>; tags: Array<{ name: string; count: number }> } | null>(null);
  const [rawConfig, setRawConfig] = useState('');
  const [git, setGit] = useState<{ branch: string; changes: string[]; log: Array<{ hash: string; message: string; date: string }> } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<number | undefined>();

  const refreshStatus = async () => { const [next, allTasks] = await Promise.all([api<Status>('/project/status'), api<Task[]>('/tasks')]); setStatus(next); setTasks(allTasks); };
  const loadContent = async (kind: Kind, closeEditor = true) => { setDocuments(await api<Document[]>(`/content/${kind}`)); if (closeEditor) setEditor(null); };
  const action = async (work: () => Promise<void>) => { try { setBusy(true); await work(); await refreshStatus(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Operation failed.'); } finally { setBusy(false); } };

  useEffect(() => { action(async () => { await refreshStatus(); await loadContent('post'); }); }, []);
  useEffect(() => {
    if (view === 'posts') action(() => loadContent('post'));
    if (view === 'drafts') action(() => loadContent('draft'));
    if (view === 'pages') action(() => loadContent('page'));
    if (view === 'taxonomy') action(async () => setTaxonomy(await api('/taxonomy')));
    if (view === 'config') action(async () => setRawConfig((await api<{ raw: string }>('/config')).raw));
    if (view === 'theme') action(async () => setRawConfig((await api<{ config: { raw: string } }>('/theme')).config.raw));
    if (view === 'git') action(async () => setGit(await api('/git/status')));
    if (view === 'logs') action(async () => setTasks(await api('/tasks')));
  }, [view]);
  useEffect(() => {
    if (view !== 'publish' && view !== 'logs') return;
    const poll = window.setInterval(() => { refreshStatus().catch(() => undefined); }, 2000);
    return () => window.clearInterval(poll);
  }, [view]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  const currentKind: Kind = view === 'drafts' ? 'draft' : view === 'pages' ? 'page' : 'post';
  const filtered = useMemo(() => documents.filter(item => item.title.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  const save = async (item = editor) => {
    if (!item) return;
    const saved = await api<Document>(`/content/${item.kind}?path=${encodeURIComponent(item.path)}`, { method: 'PUT', body: JSON.stringify({ data: item.data, body: item.body, hash: item.hash }) });
    setEditor(saved); setNotice('Saved.'); await loadContent(item.kind, false);
  };
  const scheduleSave = (next: Document) => { setEditor(next); if (saveTimer.current) window.clearTimeout(saveTimer.current); saveTimer.current = window.setTimeout(() => action(() => save(next)), 2000); };
  const create = async () => {
    const title = window.prompt(`New ${currentKind} title`); if (!title) return;
    await action(async () => { const created = await api<Document>(`/content/${currentKind}`, { method: 'POST', body: JSON.stringify({ title, data: currentKind !== 'page' ? { categories: [], tags: [] } : {} }) }); await loadContent(currentKind, false); setEditor(created); });
  };
  const recycle = async (item: Document) => { if (!window.confirm(`Move “${item.title}” to the recycle bin?`)) return; await action(async () => { await api(`/content/${item.kind}/recycle`, { method: 'POST', body: JSON.stringify({ path: item.path, includeAssets: true }) }); await loadContent(item.kind); }); };
  const runTask = async (type: 'clean' | 'generate' | 'deploy' | 'preview') => { if (busy) return; const confirmed = type !== 'deploy' || window.confirm('Deploy will publish generated files to the configured deployment branch (main). Continue?'); if (!confirmed) return; await action(async () => { await api(`/tasks/${type}`, { method: 'POST', body: JSON.stringify({ confirmed, port: 4000 }) }); setNotice(`${type} task started.`); }); };
  const upload = async (file: File) => {
    if (!editor) return setNotice('Open a post before uploading media.');
    const form = new FormData(); form.append('postPath', editor.path); form.append('file', file);
    try { const response = await fetch('/api/media/upload', { method: 'POST', body: form }); const data = await response.json(); if (!data.ok) throw new Error(data.error?.message); scheduleSave({ ...editor, body: `${editor.body}\n\n${data.data.markdown}\n` }); setNotice('Media uploaded and inserted.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Upload failed.'); }
  };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span>◆</span> Hexo Admin</div><nav>{nav.map(([key, label, icon]) => <button key={key} className={view === key ? 'nav active' : 'nav'} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav><div className="sidebar-foot">Local only<br /><span>{status?.branch ?? 'Loading'} branch</span></div></aside>
    <main className="main"><header><div><h1>{nav.find(item => item[0] === view)?.[1]}</h1><p>{status?.root ?? 'Reading Hexo project...'}</p></div><div className="header-actions"><button onClick={() => refreshStatus()} disabled={busy}>Refresh</button>{(['posts', 'drafts', 'pages'] as View[]).includes(view) && <button className="primary" onClick={create}>New</button>}</div></header>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {view === 'dashboard' && <Dashboard status={status} onTask={runTask} onView={setView} />}
      {(['posts', 'drafts', 'pages'] as View[]).includes(view) && <ContentView items={filtered} query={query} onQuery={setQuery} onOpen={item => action(async () => setEditor(await api<Document>(`/content/${item.kind}/read?path=${encodeURIComponent(item.path)}`)))} onRecycle={recycle} />}
      {view === 'taxonomy' && <Taxonomy data={taxonomy} />}
      {view === 'media' && <Media editor={editor} onUpload={upload} />}
      {(view === 'config' || view === 'theme') && <ConfigEditor raw={rawConfig} onChange={setRawConfig} onSave={() => action(async () => { await api(view === 'config' ? '/config' : '/theme', { method: 'PUT', body: JSON.stringify({ raw: rawConfig }) }); setNotice('YAML validated, backed up, and saved.'); })} />}
      {view === 'publish' && <Publish status={status} tasks={tasks} busy={busy} onTask={runTask} onStop={() => action(async () => { await api('/preview/stop', { method: 'POST' }); })} />}
      {view === 'git' && <GitView data={git} onRefresh={() => action(async () => setGit(await api('/git/status')))} onPull={() => { if (window.confirm('Pull updates for the current source branch?')) action(async () => { await api('/git/pull', { method: 'POST', body: JSON.stringify({ confirmed: true }) }); setNotice('Pull complete.'); }); }} onCommit={(paths, message) => action(async () => { await api('/git/commit', { method: 'POST', body: JSON.stringify({ paths, message, confirmed: true }) }); setNotice('Commit complete.'); setGit(await api('/git/status')); })} onPush={() => { if (window.confirm('Push the current source branch?')) action(async () => { await api('/git/push', { method: 'POST', body: JSON.stringify({ confirmed: true }) }); setNotice('Push complete.'); }); }} />}
      {view === 'logs' && <TaskLogs tasks={tasks} />}
      {editor && <Editor item={editor} onChange={scheduleSave} onSave={() => action(() => save())} onClose={() => setEditor(null)} onUpload={upload} />}
    </main>
  </div>;
}

function Dashboard({ status, onTask, onView }: { status: Status | null; onTask: (type: 'clean' | 'generate' | 'deploy' | 'preview') => void; onView: (view: View) => void }) {
  const cards = [['Posts', status?.posts ?? 0, 'posts'], ['Drafts', status?.drafts ?? 0, 'drafts'], ['Categories', status?.categories ?? 0, 'taxonomy'], ['Tags', status?.tags ?? 0, 'taxonomy'], ['Pages', status?.pages ?? 0, 'pages'], ['Uncommitted', status?.changedFiles ?? 0, 'git']] as const;
  return <><section className="stats">{cards.map(([label, value, target]) => <button className="stat" key={label} onClick={() => onView(target as View)}><span>{label}</span><strong>{value}</strong></button>)}</section><section className="grid two"><article className="card"><h2>Quick actions</h2><div className="actions"><button className="primary" onClick={() => onView('posts')}>New post</button><button onClick={() => onTask('generate')}>Generate</button><button onClick={() => onTask('preview')}>Preview</button><button className="danger" onClick={() => onTask('deploy')}>Deploy</button></div></article><article className="card"><h2>Project status</h2><dl><dt>Theme</dt><dd>{status?.theme || '—'}</dd><dt>Source branch</dt><dd>{status?.branch || '—'}</dd><dt>Local preview</dt><dd>{status?.preview ? <a href={status.preview.url} target="_blank">{status.preview.url}</a> : 'Not running'}</dd></dl></article></section></>;
}

function ContentView({ items, query, onQuery, onOpen, onRecycle }: { items: Document[]; query: string; onQuery: (value: string) => void; onOpen: (item: Document) => void; onRecycle: (item: Document) => void }) { return <section className="card"><div className="toolbar"><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search titles" /><span>{items.length} items</span></div><table><thead><tr><th>Title</th><th>Categories / tags</th><th>Updated</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.path}><td><button className="text-button" onClick={() => onOpen(item)}>{item.title}</button><small>{item.path}</small></td><td>{[...(Array.isArray(item.data.categories) ? item.data.categories : item.data.categories ? [item.data.categories] : []), ...(Array.isArray(item.data.tags) ? item.data.tags : item.data.tags ? [item.data.tags] : [])].map(String).map(tag => <span className="chip" key={tag}>{tag}</span>)}</td><td>{new Date(item.mtimeMs).toLocaleString()}</td><td><button className="icon danger" onClick={() => onRecycle(item)}>Delete</button></td></tr>)}</tbody></table></section>; }
function Taxonomy({ data }: { data: { categories: Array<{ name: string; count: number }>; tags: Array<{ name: string; count: number }> } | null }) { return <section className="grid two"><article className="card"><h2>Categories</h2>{data?.categories.map(item => <div className="list-row" key={item.name}><span>{item.name}</span><b>{item.count}</b></div>)}</article><article className="card"><h2>Tags</h2><div>{data?.tags.map(item => <span className="chip" key={item.name}>{item.name} {item.count}</span>)}</div></article></section>; }
function Media({ editor, onUpload }: { editor: Document | null; onUpload: (file: File) => void }) { return <section className="card"><h2>Post media assets</h2>{editor ? <><p>Open post: <b>{editor.title}</b></p><label className="dropzone">Choose an image or attachment<input type="file" onChange={event => event.target.files?.[0] && onUpload(event.target.files[0])} /></label></> : <p>Open a post in the content list first; uploaded media will be stored with that post’s assets.</p>}</section>; }
function ConfigEditor({ raw, onChange, onSave }: { raw: string; onChange: (value: string) => void; onSave: () => void }) { return <section className="card editor-card"><div className="toolbar"><span>YAML is validated and backed up before saving.</span><button className="primary" onClick={onSave}>Validate and save</button></div><textarea value={raw} onChange={event => onChange(event.target.value)} spellCheck={false} /></section>; }
function Publish({ status, tasks, busy, onTask, onStop }: { status: Status | null; tasks: Task[]; busy: boolean; onTask: (type: 'clean' | 'generate' | 'deploy' | 'preview') => void; onStop: () => void }) { return <section className="grid two"><article className="card"><h2>Local preview</h2><p>{status?.preview ? <a href={status.preview.url} target="_blank">Running: {status.preview.url}</a> : 'Not running'}</p>{status?.preview ? <button className="danger" disabled={busy} onClick={onStop}>Stop preview</button> : <button className="primary" disabled={busy} onClick={() => onTask('preview')}>Start preview</button>}</article><article className="card"><h2>Publishing workflow</h2><p className="muted">Commit source changes to <code>hexo</code>. Hexo deploy publishes generated files to <code>main</code>.</p><div className="actions"><button disabled={busy} onClick={() => onTask('clean')}>Clean</button><button disabled={busy} onClick={() => onTask('generate')}>Generate</button><button className="danger" disabled={busy} onClick={() => onTask('deploy')}>Deploy to main</button></div></article><TaskLogs tasks={tasks} /></section>; }
function GitView({ data, onRefresh, onPull, onCommit, onPush }: { data: { branch: string; changes: string[]; log: Array<{ hash: string; message: string; date: string }> } | null; onRefresh: () => void; onPull: () => void; onCommit: (paths: string[], message: string) => void; onPush: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected((data?.changes ?? []).map(change => change.slice(3)).filter(Boolean)), [data]);
  const toggle = (file: string) => setSelected(current => current.includes(file) ? current.filter(value => value !== file) : [...current, file]);
  const commit = () => { const message = window.prompt(`Commit ${selected.length} selected file(s)`); if (message && selected.length) onCommit(selected, message); };
  return <section className="grid two"><article className="card"><div className="toolbar"><h2>Working tree · {data?.branch ?? '—'}</h2><button onClick={onRefresh}>Refresh</button></div>{data?.changes.length ? data.changes.map(change => { const file = change.slice(3); return <label className="git-change" key={change}><input type="checkbox" checked={selected.includes(file)} onChange={() => toggle(file)} /><code>{change}</code></label>; }) : <p>No uncommitted changes.</p>}<div className="actions"><button onClick={onPull}>Pull source branch</button><button disabled={!selected.length} onClick={commit}>Commit selected</button><button className="primary" onClick={onPush}>Push source branch</button></div></article><article className="card"><h2>Recent commits</h2>{data?.log.map(item => <div className="list-row" key={item.hash}><code>{item.hash}</code><span>{item.message}</span></div>)}</article></section>;
}
function TaskLogs({ tasks }: { tasks: Task[] }) { return <section className="card task-log"><h2>Task logs</h2>{tasks.length ? tasks.map(task => <details key={task.id}><summary><b>{task.type}</b> · {task.status} · {new Date(task.startedAt).toLocaleTimeString()}</summary><pre>{task.stdout || task.stderr || 'Awaiting output...'}</pre></details>) : <p>No tasks yet.</p>}</section>; }
function Editor({ item, onChange, onSave, onClose, onUpload }: { item: Document; onChange: (item: Document) => void; onSave: () => void; onClose: () => void; onUpload: (file: File) => void }) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const setData = (key: string, value: unknown) => onChange({ ...item, data: { ...item.data, [key]: value } });
  const arrayField = (key: 'categories' | 'tags') => (Array.isArray(item.data[key]) ? item.data[key] : item.data[key] ? [item.data[key]] : []).join(', ');
  return <div className="modal"><div className="editor-modal"><div className="modal-head"><div><b>{item.title}</b><small>{item.path}</small></div><div><button onClick={onSave}>Save</button><button className="primary" onClick={onClose}>Done</button></div></div><div className="editor-layout"><aside className="properties"><label>Title<input value={String(item.data.title ?? item.title)} onChange={event => setData('title', event.target.value)} /></label><label>Categories<input value={arrayField('categories')} onChange={event => setData('categories', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></label><label>Tags<input value={arrayField('tags')} onChange={event => setData('tags', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></label><label>Cover image<input value={String(item.data.cover ?? '')} onChange={event => setData('cover', event.target.value)} /></label><label className="file-button">Upload image<input type="file" accept="image/*" onChange={event => event.target.files?.[0] && onUpload(event.target.files[0])} /></label><small>Autosaves source after two seconds. External changes are detected before writing.</small></aside><section className="editor-workspace"><div className="editor-tabs"><button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit Markdown</button><button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>Preview</button></div>{mode === 'edit' ? <MarkdownEditor key={item.path} value={item.body} onChange={body => onChange({ ...item, body })} /> : <article className="preview"><h3>{String(item.data.title ?? item.title)}</h3><p className="muted">{arrayField('categories')}</p><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.body}</ReactMarkdown></article>}</section></div></div></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
