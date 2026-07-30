import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Vditor from 'vditor';
import 'vditor/dist/js/i18n/zh_CN.js';
import 'vditor/dist/index.css';
import lutePath from 'vditor/dist/js/lute/lute.min.js?url';
import './style.css';

type Kind = 'post' | 'draft' | 'page';
type Document = { kind: Kind; path: string; title: string; data: Record<string, unknown>; body: string; mtimeMs: number; hash: string };
type Task = { id: string; type: string; status: string; startedAt: string; stdout: string; stderr: string };
type Status = { root: string; theme: string; posts: number; drafts: number; pages: number; categories: number; tags: number; branch: string; changedFiles: number; preview: { port: number; url: string } | null; recentPosts: Array<{ title: string; path: string; mtimeMs: number }>; recentTasks: Task[]; environment: { node: string; platform: string; git: string; hexo: string; adminUrl: string } };
type RecycleItem = { ticket: string; kind: Kind; originalPath: string; deletedAt: string; items: string[] };
type MediaAsset = { name: string; size: number; used: boolean; path: string };
type LibraryMediaAsset = MediaAsset & { postPath: string; postTitle: string };
type OperationLog = { at: string; action: string; result: 'succeeded' | 'failed'; detail: Record<string, unknown> };
type Schedule = { path: string; title: string; publishAt: string };
type SeoIssue = { rule: string; level: 'warning' | 'suggestion'; message: string; suggestion: string };
type SeoReport = { warnings: number; suggestions: number; articles: Array<{ path: string; title: string; kind: Kind; issues: SeoIssue[] }> };
type GitInfo = { branch: string; tracking: string; remote: string; ahead: number; behind: number; branches: string[]; changes: string[]; conflicts: string[]; log: Array<{ hash: string; message: string; date: string }> };
type View = 'dashboard' | 'posts' | 'drafts' | 'schedule' | 'taxonomy' | 'pages' | 'recycle' | 'media' | 'seo' | 'config' | 'theme' | 'publish' | 'git' | 'logs' | 'system';

function previewMediaUrl(source: string, postPath: string) {
  // Keep external and site-root URLs untouched. Hexo post assets are stored
  // beside the Markdown source and are intentionally referenced by filename.
  if (!source || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(source)) return source;
  let reference = source.split(/[?#]/, 1)[0];
  try { reference = decodeURIComponent(reference); } catch { return source; }
  const postAssetDirectory = postPath.split('/').at(-1)?.replace(/\.md$/i, '') ?? '';
  const segments = reference.split('/');
  // Hexo's asset-folder convention permits both image.png and
  // post-slug/image.png in Markdown produced by older themes/plugins.
  const name = segments.length === 1 ? segments[0] : segments.length === 2 && segments[0] === postAssetDirectory ? segments[1] : '';
  if (!name || name.includes('\\') || name.includes('..')) return source;
  return `/api/media/file?postPath=${encodeURIComponent(postPath)}&name=${encodeURIComponent(name)}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Do not send an empty JSON body declaration for body-less requests (such as
  // stopping preview). Fastify correctly rejects an empty JSON request body.
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? 'Operation failed.');
  return payload.data as T;
}

const nav: Array<[View, string, string]> = [
  ['dashboard', 'Dashboard', '◆'], ['posts', 'Posts', '▣'], ['drafts', 'Drafts', '▤'], ['taxonomy', 'Categories & tags', '◇'], ['pages', 'Pages', '▧'], ['media', 'Media', '▦'], ['config', 'Configuration', '⚙'], ['theme', 'Theme', '◈'], ['publish', 'Publish', '↗'], ['git', 'Git', '◌'], ['logs', 'Activity log', '◫']
];

nav.splice(5, 0, ['recycle', 'Recycle bin', 'R']);
nav.splice(4, 0, ['schedule', 'Scheduled publish', 'T']);
nav.splice(8, 0, ['seo', 'SEO checks', 'S']);
nav.push(['system', 'System settings', 'S']);

function SourceMarkdownEditor({ value, onChange, onSave, jumpToLine }: { value: string; onChange: (value: string) => void; onSave?: () => void; jumpToLine?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView | null>(null);
  const latest = useRef(value);
  const callback = useRef(onChange);
  const saveCallback = useRef(onSave);
  callback.current = onChange;
  saveCallback.current = onSave;
  const insert = (before: string, after = '') => {
    const view = editorView.current; if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch({ changes: { from, to, insert: `${before}${selected}${after}` }, selection: { anchor: from + before.length, head: from + before.length + selected.length } });
    view.focus();
  };
  const prefixLine = (prefix: string) => {
    const view = editorView.current; if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.from);
    view.dispatch({ changes: { from: line.from, insert: prefix }, selection: { anchor: view.state.selection.main.from + prefix.length } });
    view.focus();
  };
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({ doc: latest.current, extensions: [lineNumbers(), markdown(), keymap.of([...defaultKeymap, indentWithTab, { key: 'Mod-s', run: () => { saveCallback.current?.(); return true; } }]), EditorView.lineWrapping, EditorView.updateListener.of(update => { if (update.docChanged) { latest.current = update.state.doc.toString(); callback.current(latest.current); } })] }),
      parent: host.current
    });
    editorView.current = view;
    return () => { editorView.current = null; view.destroy(); };
  }, []);
  useEffect(() => { latest.current = value; }, [value]);
  useEffect(() => { const view = editorView.current; if (!view || !jumpToLine) return; const line = view.state.doc.line(Math.min(jumpToLine, view.state.doc.lines)); view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) }); view.focus(); }, [jumpToLine]);
  const outline = [...value.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map(match => ({ level: match[1].length, title: match[2], line: value.slice(0, match.index).split('\n').length }));
  const jump = (lineNumber: number) => { const view = editorView.current; if (!view) return; const line = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines)); view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) }); view.focus(); };
  const copy = async () => { try { await navigator.clipboard.writeText(value); } catch { window.prompt('Copy Markdown', value); } };
  const toggleFullscreen = async () => { const shell = host.current?.closest('.markdown-shell'); if (!shell) return; if (document.fullscreenElement) await document.exitFullscreen(); else await shell.requestFullscreen(); };
  return <div className="markdown-shell"><div className="markdown-toolbar"><button title="Heading 1" onClick={() => prefixLine('# ')}>H1</button><button title="Heading 2" onClick={() => prefixLine('## ')}>H2</button><button title="Heading 3" onClick={() => prefixLine('### ')}>H3</button><button onClick={() => insert('**', '**')}>Bold</button><button onClick={() => insert('*', '*')}>Italic</button><button onClick={() => insert('~~', '~~')}>Strike</button><button onClick={() => prefixLine('> ')}>Quote</button><button onClick={() => prefixLine('- [ ] ')}>Task</button><button onClick={() => prefixLine('- ')}>List</button><button onClick={() => insert('[', '](https://)')}>Link</button><button onClick={() => insert('![alt text](', ')')}>Image</button><button onClick={() => insert('\n```text\n', '\n```\n')}>Code</button><button onClick={() => insert('\n| Column | Value |\n| --- | --- |\n| ', ' | |\n')}>Table</button><button onClick={() => void copy()}>Copy</button><button onClick={() => void toggleFullscreen()}>Fullscreen</button></div>{outline.length ? <details className="editor-outline"><summary>Outline ({outline.length})</summary>{outline.map(entry => <button key={`${entry.line}-${entry.title}`} style={{ paddingLeft: `${Math.max(0, entry.level - 1) * 12}px` }} onClick={() => jump(entry.line)}>{entry.title}</button>)}</details> : null}<div className="markdown" ref={host} aria-label="Markdown editor" /></div>;
}

function VditorWysiwygEditor({ value, postPath, onChange, onSave }: { value: string; postPath?: string; onChange: (value: string) => void; onSave?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Vditor | null>(null);
  const latest = useRef(value);
  const mediaReferences = useRef(new Map<string, string>());
  const callback = useRef(onChange);
  const saveCallback = useRef(onSave);
  const inputReady = useRef(false);
  callback.current = onChange;
  saveCallback.current = onSave;
  const displayMarkdown = (markdownValue: string) => markdownValue.replace(/(!\[[^\]]*\]\()([^\s)]+)(\))/g, (full, prefix, source, suffix) => {
    const currentPostPath = postPath ?? document.querySelector('.modal-head small')?.textContent ?? '';
    const mediaUrl = previewMediaUrl(source, currentPostPath);
    if (mediaUrl === source) return full;
    mediaReferences.current.set(mediaUrl, source);
    return `${prefix}${mediaUrl}${suffix}`;
  });
  const sourceMarkdown = (markdownValue: string) => {
    let restored = markdownValue;
    for (const [mediaUrl, source] of mediaReferences.current) restored = restored.split(mediaUrl).join(source);
    return restored;
  };
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    inputReady.current = false;
    let editor: Vditor | null = null;
    editor = new Vditor(host.current, {
      mode: 'wysiwyg',
      lang: 'zh_CN',
      i18n: (window as Window & { VditorI18n?: object }).VditorI18n,
      _lutePath: lutePath,
      cache: { enable: false },
      value: displayMarkdown(latest.current),
      minHeight: 480,
      height: '100%',
      toolbar: [],
      counter: { enable: false },
      outline: { enable: false },
      input(markdownValue) {
        // Vditor normalizes its initial DOM and can emit an input event while
        // opening a document. Never treat that internal conversion as a user
        // change: opening an article must not rewrite its Markdown file.
        if (disposed || !inputReady.current) return;
        const restored = sourceMarkdown(markdownValue);
        latest.current = restored;
        callback.current(restored);
      },
      ctrlEnter() { saveCallback.current?.(); },
      after() {
        if (disposed) return;
        instance.current = editor;
        window.setTimeout(() => { if (!disposed) inputReady.current = true; }, 80);
      }
    });
    return () => { disposed = true; inputReady.current = false; if (instance.current === editor) instance.current = null; editor?.destroy(); };
  }, []);
  useEffect(() => {
    const editor = instance.current;
    if (!editor || value === latest.current) return;
    latest.current = value;
    editor.setValue(displayMarkdown(value), true);
  }, [value, postPath]);
  return <div className="vditor-shell typora-canvas" ref={host} aria-label="所见即所得 Markdown 编辑器" />;
}

function MarkdownEditor(props: { value: string; postPath?: string; onChange: (value: string) => void; onSave?: () => void; jumpToLine?: number }) {
  const [sourceMode, setSourceMode] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const hasHexoTags = /\{%[\s\S]*?%\}/.test(props.value);
  useEffect(() => {
    const modal = document.querySelector('.editor-modal');
    modal?.classList.toggle('properties-collapsed', propertiesCollapsed);
    return () => modal?.classList.remove('properties-collapsed');
  }, [propertiesCollapsed]);
  return <div className="live-markdown-editor"><div className="editor-mode-bar"><div><button className="properties-toggle" aria-label={propertiesCollapsed ? '展开属性' : '收起属性'} title={propertiesCollapsed ? '展开属性' : '收起属性'} onClick={() => setPropertiesCollapsed(value => !value)}>{propertiesCollapsed ? '▶' : '◀'}</button><button className={!sourceMode ? 'active' : ''} onClick={() => setSourceMode(false)}>沉浸编辑</button><button className={sourceMode ? 'active' : ''} onClick={() => setSourceMode(true)}>源码兼容模式</button></div><small>{sourceMode ? '直接编辑 Markdown 源码。' : '接近 Typora 的写作画布；保存的仍是 Markdown 源码。'}</small></div>{hasHexoTags && !sourceMode ? <p className="hexo-tag-notice">检测到 Hexo 标签插件语法。所见即所得模式可能无法完整展示，请保存后使用 Hexo 预览确认；需要精确修改标签时可切换到“源码兼容模式”。</p> : null}{sourceMode ? <SourceMarkdownEditor value={props.value} onChange={props.onChange} onSave={props.onSave} jumpToLine={props.jumpToLine} /> : <VditorWysiwygEditor value={props.value} postPath={props.postPath} onChange={props.onChange} onSave={props.onSave} />}</div>;
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [status, setStatus] = useState<Status | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [editor, setEditor] = useState<Document | null>(null);
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const [taxonomy, setTaxonomy] = useState<{ categories: Array<{ name: string; count: number }>; tags: Array<{ name: string; count: number }> } | null>(null);
  const [taxonomyPosts, setTaxonomyPosts] = useState<Document[]>([]);
  const [rawConfig, setRawConfig] = useState('');
  const [commonConfig, setCommonConfig] = useState<Record<string, string>>({});
  const [themeInfo, setThemeInfo] = useState<{ theme: string; themes: string[] } | null>(null);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [gitDiff, setGitDiff] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [seo, setSeo] = useState<SeoReport | null>(null);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('hexo-admin-color-mode') === 'dark');
  const saveTimer = useRef<number | undefined>();
  const watchedTask = useRef<{ id: string; type: string } | null>(null);

  const refreshStatus = async () => {
    const [next, allTasks] = await Promise.all([api<Status>('/project/status'), api<Task[]>('/tasks')]);
    setStatus(next); setTasks(allTasks);
    const watched = watchedTask.current;
    const task = watched && allTasks.find(item => item.id === watched.id);
    if (!watched || !task) return;
    if (task.status === 'succeeded') {
      setNotice(`${watched.type} completed successfully.`);
      watchedTask.current = null;
    } else if (task.status === 'failed') {
      setNotice(`${watched.type} failed. Open Task logs for details.`);
      watchedTask.current = null;
    } else if (watched.type === 'preview' && task.status === 'running') {
      setNotice(`Preview started successfully${next.preview ? `: ${next.preview.url}` : '.'}`);
      watchedTask.current = null;
    }
  };
  const loadContent = async (kind: Kind, closeEditor = true) => { setDocuments(await api<Document[]>(`/content/${kind}`)); if (closeEditor) setEditor(null); };
  const loadTaxonomy = async () => {
    const [nextTaxonomy, posts] = await Promise.all([api<{ categories: Array<{ name: string; count: number }>; tags: Array<{ name: string; count: number }> }>('/taxonomy'), api<Document[]>('/content/post')]);
    setTaxonomy(nextTaxonomy); setTaxonomyPosts(posts);
  };
  const action = async (work: () => Promise<void>) => { try { setBusy(true); await work(); await refreshStatus(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Operation failed.'); } finally { setBusy(false); } };

  useEffect(() => { action(async () => { await refreshStatus(); await loadContent('post'); }); }, []);
  useEffect(() => {
    if (view === 'posts') action(() => loadContent('post'));
    if (view === 'drafts') action(() => loadContent('draft', false));
    if (view === 'schedule') action(async () => { const [nextSchedules, drafts] = await Promise.all([api<Schedule[]>('/schedule'), api<Document[]>('/content/draft')]); setSchedules(nextSchedules); setDocuments(drafts); });
    if (view === 'pages') action(() => loadContent('page'));
    if (view === 'recycle') action(async () => setRecycleItems(await api<RecycleItem[]>('/recycle')));
    if (view === 'taxonomy') action(loadTaxonomy);
    if (view === 'config') action(async () => { const [config, common] = await Promise.all([api<{ raw: string }>('/config'), api<Record<string, string>>('/config/common')]); setRawConfig(config.raw); setCommonConfig(common); });
    if (view === 'theme') action(async () => { const next = await api<{ theme: string; themes: string[]; config: { raw: string } }>('/theme'); setThemeInfo({ theme: next.theme, themes: next.themes }); setRawConfig(next.config.raw); });
    if (view === 'git') action(async () => setGit(await api('/git/status')));
    if (view === 'seo') action(async () => setSeo(await api<SeoReport>('/seo')));
    if (view === 'logs') action(async () => { const [nextTasks, logs] = await Promise.all([api<Task[]>('/tasks'), api<OperationLog[]>('/logs')]); setTasks(nextTasks); setOperationLogs(logs); });
  }, [view]);
  useEffect(() => {
    if (view !== 'publish' && view !== 'logs') return;
    const poll = window.setInterval(() => { refreshStatus().catch(() => undefined); }, 2000);
    return () => window.clearInterval(poll);
  }, [view]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => { localStorage.setItem('hexo-admin-color-mode', dark ? 'dark' : 'light'); }, [dark]);

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
  const transition = async (item: Document) => {
    const to: 'post' | 'draft' = item.kind === 'draft' ? 'post' : 'draft';
    if (!window.confirm(item.kind === 'draft' ? `Publish “${item.title}” as a post?` : `Move “${item.title}” back to drafts?`)) return;
    await action(async () => { await api(`/content/${item.kind}/transition`, { method: 'POST', body: JSON.stringify({ path: item.path, to }) }); await loadContent(item.kind); setNotice(item.kind === 'draft' ? 'Draft published as a post.' : 'Post moved to drafts.'); });
  };
  const copyContent = async (item: Document) => { const title = window.prompt(`Copy “${item.title}” as:`, `${item.title} copy`)?.trim(); if (!title) return; await action(async () => { const copy = await api<Document>(`/content/${item.kind}/copy`, { method: 'POST', body: JSON.stringify({ path: item.path, title }) }); await loadContent(item.kind, false); setEditor(copy); setNotice('Content copied.'); }); };
  const renamePage = async (item: Document) => { const current = item.path.replace(/^source\//, '').replace(/\.md$/, ''); const targetPath = window.prompt('New page path (relative to source):', current)?.trim(); if (!targetPath || targetPath === current) return; await action(async () => { const renamed = await api<Document>(`/content/page/rename`, { method: 'POST', body: JSON.stringify({ path: item.path, targetPath }) }); setEditor(renamed); await loadContent('page', false); setNotice('Page path updated.'); }); };
  const restoreRecycle = async (item: RecycleItem) => { if (!window.confirm(`Restore “${item.originalPath}”?`)) return; await action(async () => { await api(`/recycle/${item.ticket}/restore`, { method: 'POST' }); setRecycleItems(await api<RecycleItem[]>('/recycle')); setNotice('Item restored.'); }); };
  const deleteRecycle = async (item: RecycleItem) => { if (!window.confirm(`Permanently delete “${item.originalPath}”? This cannot be undone.`)) return; await action(async () => { await api(`/recycle/${item.ticket}`, { method: 'DELETE' }); setRecycleItems(await api<RecycleItem[]>('/recycle')); setNotice('Recycle-bin item permanently deleted.'); }); };
  const clearRecycle = async () => { if (!window.confirm('Permanently delete every item in the recycle bin? This cannot be undone.')) return; await action(async () => { const result = await api<{ deleted: number }>('/recycle/clear', { method: 'POST' }); setRecycleItems([]); setNotice(`${result.deleted} recycle-bin item(s) permanently deleted.`); }); };
  const recycleMany = async (items: Document[]) => { if (!items.length || !window.confirm(`Move ${items.length} item(s) to the recycle bin?`)) return; await action(async () => { for (const item of items) await api(`/content/${item.kind}/recycle`, { method: 'POST', body: JSON.stringify({ path: item.path, includeAssets: true }) }); await loadContent(items[0].kind); setNotice(`${items.length} item(s) moved to the recycle bin.`); }); };
  const transitionMany = async (items: Document[]) => { if (!items.length) return; const to: 'post' | 'draft' = items[0].kind === 'draft' ? 'post' : 'draft'; if (!window.confirm(`${items[0].kind === 'draft' ? 'Publish' : 'Move'} ${items.length} item(s)?`)) return; await action(async () => { for (const item of items) await api(`/content/${item.kind}/transition`, { method: 'POST', body: JSON.stringify({ path: item.path, to }) }); await loadContent(items[0].kind); setNotice(`${items.length} item(s) updated.`); }); };
  const addTaxonomyMany = async (items: Document[], field: 'categories' | 'tags') => { if (!items.length) return; const value = window.prompt(`Add ${field === 'categories' ? 'category' : 'tag'} to ${items.length} item(s):`)?.trim(); if (!value) return; await action(async () => { for (const item of items) { const current = Array.isArray(item.data[field]) ? item.data[field].map(String) : item.data[field] ? [String(item.data[field])] : []; await api(`/content/${item.kind}?path=${encodeURIComponent(item.path)}`, { method: 'PUT', body: JSON.stringify({ data: { ...item.data, [field]: [...new Set([...current, value])] }, body: item.body, hash: item.hash }) }); } await loadContent(items[0].kind); setNotice(`${field} added to ${items.length} item(s).`); }); };
  const manageTaxonomy = async (type: 'category' | 'tag', operation: 'rename' | 'merge' | 'delete', name: string) => {
    const replacement = operation === 'rename' || operation === 'merge' ? window.prompt(`${operation === 'merge' ? 'Merge' : 'Rename'} ${type} “${name}” to:`)?.trim() : undefined;
    if ((operation === 'rename' || operation === 'merge') && !replacement) return;
    const label = operation === 'rename' ? `Rename ${type} “${name}” to “${replacement}”?` : operation === 'merge' ? `Merge ${type} “${name}” into “${replacement}”? Existing “${replacement}” references will be kept.` : `Remove ${type} “${name}” from all posts? Posts will not be deleted.`;
    if (!window.confirm(label)) return;
    await action(async () => { const result = await api<{ affected: number }>(`/taxonomy/${type === 'category' ? 'categories' : 'tags'}`, { method: 'PATCH', body: JSON.stringify({ action: operation === 'merge' ? 'rename' : operation, name, replacement }) }); await loadTaxonomy(); setNotice(`${type} ${operation === 'merge' ? 'merged' : operation === 'rename' ? 'renamed' : 'removed'} in ${result.affected} post(s).`); });
  };
  const runTask = async (type: 'clean' | 'generate' | 'deploy' | 'preview') => { if (busy) return; let confirmed = true; if (type === 'deploy') { try { const check = await api<{ configurationValid: boolean; frontMatterValid: boolean; deploymentConfigured: boolean; posts: number; drafts: number; changedFiles: number }>('/deploy/check'); if (!check.deploymentConfigured) return setNotice('Deployment configuration is missing. Check Configuration before deploying.'); confirmed = window.confirm(`Deploy to main?\n\nConfiguration: valid\nFront Matter: valid (${check.posts} posts, ${check.drafts} drafts)\nUncommitted Git files: ${check.changedFiles}\n\nContinue with clean, generate, and deploy?`); } catch (error) { return setNotice(error instanceof Error ? error.message : 'Deployment pre-check failed.'); } } if (!confirmed) return; await action(async () => { const task = await api<Task>(`/tasks/${type}`, { method: 'POST', body: JSON.stringify({ confirmed, port: 4000 }) }); watchedTask.current = { id: task.id, type }; setNotice(`${type} task started.`); }); };
  const upload = async (file: File) => {
    if (!editor) return setNotice('Open a post before uploading media.');
    const form = new FormData(); form.append('postPath', editor.path); form.append('file', file);
    try { const response = await fetch('/api/media/upload', { method: 'POST', body: form }); const data = await response.json(); if (!data.ok) throw new Error(data.error?.message); scheduleSave({ ...editor, body: `${editor.body}\n\n${data.data.markdown}\n` }); setNotice('Media uploaded and inserted.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Upload failed.'); }
  };
  const openProject = async (root: string) => { if (!window.confirm(`Open Hexo project at:\n${root}\n\nUnsaved editor changes should be saved first.`)) return; await action(async () => { const next = await api<Status>('/project/open', { method: 'POST', body: JSON.stringify({ root }) }); setStatus(next); await loadContent('post'); setView('dashboard'); setNotice('Hexo project opened.'); }); };

  return <div className={dark ? 'app-shell dark' : 'app-shell'}>
    <aside className="sidebar"><div className="brand"><span>◆</span> Hexo Admin</div><nav>{nav.map(([key, label, icon]) => <button key={key} className={view === key ? 'nav active' : 'nav'} onClick={() => setView(key)}><span>{icon}</span>{label}</button>)}</nav><div className="sidebar-foot">Local only<br /><span>{status?.branch ?? 'Loading'} branch</span></div></aside>
    <main className="main"><header><div><h1>{nav.find(item => item[0] === view)?.[1]}</h1><p>{status?.root ?? 'Reading Hexo project...'}</p></div><div className="header-actions"><button onClick={() => setDark(value => !value)}>{dark ? 'Light mode' : 'Dark mode'}</button><button onClick={() => refreshStatus()} disabled={busy}>Refresh</button>{(['posts', 'drafts', 'pages'] as View[]).includes(view) && <button className="primary" onClick={create}>New</button>}</div></header>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {view === 'dashboard' && <><Dashboard status={status} onTask={runTask} onView={setView} onStop={() => action(async () => { await api('/preview/stop', { method: 'POST' }); setNotice('Preview stopped successfully.'); })} /><DashboardDetails status={status} /></>}
      {(['posts', 'drafts', 'pages'] as View[]).includes(view) && <ContentView items={filtered} query={query} onQuery={setQuery} onOpen={item => action(async () => setEditor(await api<Document>(`/content/${item.kind}/read?path=${encodeURIComponent(item.path)}`)))} onRecycle={recycle} onTransition={transition} onCopy={copyContent} onRecycleMany={recycleMany} onTransitionMany={transitionMany} onAddTaxonomy={addTaxonomyMany} />}
      {view === 'schedule' && <ScheduledPublish schedules={schedules} drafts={documents.filter(item => item.kind === 'draft')} onCheck={() => action(async () => { const result = await api<{ published: string[]; failed: Array<{ path: string; message: string }> }>('/schedule/check', { method: 'POST' }); const [nextSchedules, drafts] = await Promise.all([api<Schedule[]>('/schedule'), api<Document[]>('/content/draft')]); setSchedules(nextSchedules); setDocuments(drafts); setNotice(result.failed.length ? `Checked schedules: ${result.failed.length} failed.` : `${result.published.length} due draft(s) published.`); })} onCancel={schedule => { if (window.confirm(`Cancel scheduled publishing for “${schedule.title}”?`)) action(async () => { await api('/schedule', { method: 'POST', body: JSON.stringify({ path: schedule.path }) }); setSchedules(await api<Schedule[]>('/schedule')); setNotice('Scheduled publishing cancelled.'); }); }} onSet={(draft, publishAt) => action(async () => { await api('/schedule', { method: 'POST', body: JSON.stringify({ path: draft.path, publishAt }) }); setSchedules(await api<Schedule[]>('/schedule')); setNotice(`Scheduled ${draft.title}.`); })} onOpen={schedule => action(async () => { setEditor(await api<Document>(`/content/draft/read?path=${encodeURIComponent(schedule.path)}`)); setView('drafts'); })} />}
      {view === 'recycle' && <RecycleBin items={recycleItems} onRestore={restoreRecycle} onDelete={deleteRecycle} onClear={clearRecycle} />}
      {view === 'taxonomy' && <Taxonomy data={taxonomy} posts={taxonomyPosts} onOpen={item => action(async () => setEditor(await api<Document>(`/content/post/read?path=${encodeURIComponent(item.path)}`)))} onManage={manageTaxonomy} />}
      {view === 'media' && <><Media editor={editor} onUpload={upload} onInsert={asset => editor && scheduleSave({ ...editor, body: `${editor.body}\n\n![${asset.name.replace(/\.[^.]+$/, '')}](${asset.name})\n` })} /><MediaLibrary /></>}
      {view === 'seo' && <SeoChecks report={seo} onOpen={article => action(async () => { setEditor(await api<Document>(`/content/${article.kind}/read?path=${encodeURIComponent(article.path)}`)); })} onFix={(article, actionName) => action(async () => { await api('/seo/article', { method: 'PATCH', body: JSON.stringify({ kind: article.kind, path: article.path, action: actionName }) }); setSeo(await api<SeoReport>('/seo')); setNotice('SEO fix applied.'); })} onFixAll={() => { if (window.confirm('Fix every available safe SEO issue? This only adds summaries, dates, and image alt text.')) action(async () => { const result = await api<{ fixed: unknown[]; failed: Array<{ message: string }> }>('/seo/fix-all', { method: 'POST' }); setSeo(await api<SeoReport>('/seo')); setNotice(result.failed.length ? `${result.fixed.length} article(s) fixed; ${result.failed.length} could not be fixed.` : `${result.fixed.length} article(s) fixed.`); }); }} />}
      {view === 'config' && <ConfigEditor raw={rawConfig} onChange={setRawConfig} onSave={() => { if (window.confirm('Save and overwrite the current blog YAML configuration? A backup will be created.')) action(async () => { await api('/config', { method: 'PUT', body: JSON.stringify({ raw: rawConfig }) }); setNotice('YAML validated, backed up, and saved.'); }); }} common={commonConfig} onCommonChange={(field, value) => setCommonConfig(current => ({ ...current, [field]: value }))} onCommonSave={() => { if (window.confirm('Save common configuration fields? A backup will be created.')) action(async () => { const saved = await api<{ raw: string }>('/config/common', { method: 'PUT', body: JSON.stringify({ values: commonConfig }) }); setRawConfig(saved.raw); setNotice('Common configuration validated, backed up, and saved.'); }); }} />}
      {view === 'theme' && <ThemeManager info={themeInfo} raw={rawConfig} onChange={setRawConfig} onSave={() => { if (window.confirm('Save and overwrite the current theme YAML configuration? A backup will be created.')) action(async () => { await api('/theme', { method: 'PUT', body: JSON.stringify({ raw: rawConfig }) }); setNotice('Theme YAML validated, backed up, and saved.'); }); }} onSelect={theme => { if (theme === themeInfo?.theme || !window.confirm(`Switch the blog theme to “${theme}”?`)) return; action(async () => { const next = await api<{ current: string; installed: string[] }>('/theme/select', { method: 'POST', body: JSON.stringify({ theme }) }); setThemeInfo({ theme: next.current, themes: next.installed }); const config = await api<{ theme: string; themes: string[]; config: { raw: string } }>('/theme'); setRawConfig(config.config.raw); setNotice(`Theme switched to ${next.current}.`); }); }} />}
      {view === 'publish' && <><SeoPublishSummary /><Publish status={status} tasks={tasks} busy={busy} onTask={runTask} onStop={() => action(async () => { await api('/preview/stop', { method: 'POST' }); setNotice('Preview stopped successfully.'); })} /></>}
      {view === 'git' && <GitView data={git} diff={gitDiff} onDiff={path => action(async () => { const result = await api<{ stdout: string; stderr: string }>('/git/diff?path=' + encodeURIComponent(path)); setGitDiff(result.stdout || result.stderr || 'No textual diff is available for this file.'); })} onRefresh={() => action(async () => { setGit(await api('/git/status')); setGitDiff(''); })} onPull={() => { if (window.confirm('Pull updates for the current source branch?')) action(async () => { await api('/git/pull', { method: 'POST', body: JSON.stringify({ confirmed: true }) }); setNotice('Pull complete.'); }); }} onCommit={(paths, message) => action(async () => { await api('/git/commit', { method: 'POST', body: JSON.stringify({ paths, message, confirmed: true }) }); setNotice('Commit complete.'); setGit(await api('/git/status')); setGitDiff(''); })} onPush={() => { if (window.confirm('Push the current source branch?')) action(async () => { await api('/git/push', { method: 'POST', body: JSON.stringify({ confirmed: true }) }); setNotice('Push complete.'); }); }} />}
      {view === 'logs' && <ActivityLog tasks={tasks} logs={operationLogs} />}
      {view === 'system' && <SystemSettings status={status} onOpen={openProject} />}
      {editor && <Editor item={editor} onChange={scheduleSave} onSave={() => action(() => save())} onRename={renamePage} onClose={() => setEditor(null)} onUpload={upload} />}
    </main>
  </div>;
}

function Dashboard({ status, onTask, onView, onStop }: { status: Status | null; onTask: (type: 'clean' | 'generate' | 'deploy' | 'preview') => void; onView: (view: View) => void; onStop: () => void }) {
  const cards = [['Posts', status?.posts ?? 0, 'posts'], ['Drafts', status?.drafts ?? 0, 'drafts'], ['Categories', status?.categories ?? 0, 'taxonomy'], ['Tags', status?.tags ?? 0, 'taxonomy'], ['Pages', status?.pages ?? 0, 'pages'], ['Uncommitted', status?.changedFiles ?? 0, 'git']] as const;
  const preview = status?.preview;
  return <><section className="stats">{cards.map(([label, value, target]) => <button className="stat" key={label} onClick={() => onView(target as View)}><span>{label}</span><strong>{value}</strong></button>)}</section><section className="grid two"><article className="card"><h2>Quick actions</h2><div className="actions"><button className="primary" onClick={() => onView('posts')}>New post</button><button onClick={() => onTask('generate')}>Generate</button>{preview ? <button className="danger" onClick={onStop}>Stop preview</button> : <button onClick={() => onTask('preview')}>Start preview</button>}<button className="danger" onClick={() => onTask('deploy')}>Deploy</button></div></article><article className="card"><h2>Project status</h2><dl><dt>Theme</dt><dd>{status?.theme || '—'}</dd><dt>Source branch</dt><dd>{status?.branch || '—'}</dd><dt>Local preview</dt><dd>{preview ? <><b>Running: </b><a href={preview.url} target="_blank" rel="noreferrer">{preview.url}</a></> : 'Not running'}</dd></dl></article></section></>;
}
function DashboardDetails({ status }: { status: Status | null }) { return <section className="grid two dashboard-details"><article className="card"><h2>Recently modified posts</h2>{status?.recentPosts.length ? status.recentPosts.map(post => <div className="list-row" key={post.path}><span>{post.title}</span><small>{new Date(post.mtimeMs).toLocaleDateString()}</small></div>) : <p>No posts yet.</p>}</article><article className="card"><h2>Recent tasks</h2>{status?.recentTasks.length ? status.recentTasks.map(task => <div className="list-row" key={task.id}><span>{task.type}</span><b>{task.status}</b></div>) : <p>No tasks in this session.</p>}</article></section>; }
function SystemSettings({ status, onOpen }: { status: Status | null; onOpen: (root: string) => void }) { const environment = status?.environment; const [root, setRoot] = useState(status?.root ?? ''); useEffect(() => setRoot(status?.root ?? ''), [status?.root]); return <section className="grid two"><article className="card"><h2>Local project</h2><label>Hexo project root<input value={root} onChange={event => setRoot(event.target.value)} placeholder="Absolute local project path" /></label><div className="actions"><button className="primary" disabled={!root.trim() || root.trim() === status?.root} onClick={() => onOpen(root.trim())}>Open project</button></div><dl><dt>Current root</dt><dd><code>{status?.root ?? 'Reading…'}</code></dd><dt>Admin address</dt><dd>{environment ? <a href={environment.adminUrl} target="_blank">{environment.adminUrl}</a> : 'Reading…'}</dd><dt>Source branch</dt><dd><code>{status?.branch ?? '—'}</code> (commit source here)</dd><dt>Deployment branch</dt><dd><code>main</code> (updated by Hexo deploy)</dd></dl></article><article className="card"><h2>Runtime checks</h2><dl><dt>Node.js</dt><dd>{environment?.node ?? 'Reading…'}</dd><dt>Hexo</dt><dd>{environment?.hexo ?? 'Reading…'}</dd><dt>Git</dt><dd>{environment?.git ?? 'Reading…'}</dd><dt>Platform</dt><dd>{environment?.platform ?? 'Reading…'}</dd></dl><p className="muted">Only a validated Hexo project can be opened. The panel listens on the local loopback address; stop a running preview before switching projects.</p></article></section>; }

function ScheduledPublish({ schedules, drafts, onCheck, onCancel, onSet, onOpen }: { schedules: Schedule[]; drafts: Document[]; onCheck: () => void; onCancel: (schedule: Schedule) => void; onSet: (draft: Document, publishAt: string) => void; onOpen: (schedule: Schedule) => void }) { const [values, setValues] = useState<Record<string, string>>({}); const scheduled = new Map(schedules.map(schedule => [schedule.path, schedule])); return <section className="grid"><article className="card"><div className="toolbar"><div><h2>Scheduled drafts</h2><p className="muted">The local panel checks every minute and catches up at startup. It never generates or deploys automatically.</p></div><button className="primary" onClick={onCheck}>Check now</button></div>{drafts.length ? <table><thead><tr><th>Draft</th><th>Publish at</th><th /></tr></thead><tbody>{drafts.map(draft => { const current = scheduled.get(draft.path); return <tr key={draft.path}><td>{draft.title}<small>{draft.path}</small></td><td><input value={values[draft.path] ?? current?.publishAt ?? ''} placeholder="YYYY-MM-DD HH:mm:ss" onChange={event => setValues(previous => ({ ...previous, [draft.path]: event.target.value }))} /></td><td><div className="actions"><button onClick={() => { const value = (values[draft.path] ?? current?.publishAt ?? '').trim(); if (value) onSet(draft, value); }}>Schedule</button>{current && <button className="danger" onClick={() => onCancel(current)}>Cancel</button>}</div></td></tr>; })}</tbody></table> : <p className="muted">No drafts are available.</p>}</article></section>; }
function SeoChecks({ report, onOpen, onFix, onFixAll }: { report: SeoReport | null; onOpen: (article: SeoReport['articles'][number]) => void; onFix: (article: SeoReport['articles'][number], action: 'summary' | 'date' | 'image-alt' | 'all') => void; onFixAll: () => void }) {
  const fixable: Record<string, ['summary' | 'date' | 'image-alt', string] | undefined> = { description: ['summary', 'Add summary'], date: ['date', 'Set date'], 'image-alt': ['image-alt', 'Fill image alt text'] };
  const hasSafeFix = (article: SeoReport['articles'][number]) => article.issues.some(issue => Boolean(fixable[issue.rule]));
  const articles = report?.articles.filter(article => article.issues.length) ?? [];
  const safeFixArticles = articles.filter(hasSafeFix);
  return <section className="card"><div className="toolbar"><div><h2>SEO checks</h2><p className="muted">Informational only: findings do not block saving, generating, or deployment.</p></div><div className="actions">{safeFixArticles.length ? <button className="primary" onClick={onFixAll}>Fix all safe issues ({safeFixArticles.length})</button> : null}<span><b>{report?.warnings ?? 0} warnings</b> · {report?.suggestions ?? 0} suggestions</span></div></div>{articles.length ? <table><thead><tr><th>Article</th><th>Findings</th><th /></tr></thead><tbody>{articles.map(article => <tr key={`${article.kind}:${article.path}`}><td>{article.title}<small>{article.path}</small></td><td>{article.issues.map(issue => { const fix = fixable[issue.rule]; return <div key={issue.rule}><b>{issue.level}</b>: {issue.message}<small>{issue.suggestion}</small>{fix ? <button className="small-button" onClick={() => onFix(article, fix[0])}>{fix[1]}</button> : null}</div>; })}</td><td><div className="actions">{hasSafeFix(article) ? <button className="primary" onClick={() => onFix(article, 'all')}>Fix safe issues</button> : null}<button onClick={() => onOpen(article)}>Open</button></div></td></tr>)}</tbody></table> : <p className="muted">No SEO findings in current posts and drafts.</p>}</section>;
}
function ContentView({ items, query, onQuery, onOpen, onRecycle, onTransition, onCopy, onRecycleMany, onTransitionMany, onAddTaxonomy }: { items: Document[]; query: string; onQuery: (value: string) => void; onOpen: (item: Document) => void; onRecycle: (item: Document) => void; onTransition: (item: Document) => void; onCopy: (item: Document) => void; onRecycleMany: (items: Document[]) => void; onTransitionMany: (items: Document[]) => void; onAddTaxonomy: (items: Document[], field: 'categories' | 'tags') => void }) { const [category, setCategory] = useState(''); const [tag, setTag] = useState(''); const [published, setPublished] = useState(''); const [sort, setSort] = useState('updated-desc'); const [page, setPage] = useState(1); const [selected, setSelected] = useState<string[]>([]); const pageSize = 30; const values = (item: Document, field: 'categories' | 'tags') => Array.isArray(item.data[field]) ? item.data[field].map(String) : item.data[field] ? [String(item.data[field])] : []; const categories = [...new Set(items.flatMap(item => values(item, 'categories')))].sort(); const tags = [...new Set(items.flatMap(item => values(item, 'tags')))].sort(); const visible = items.filter(item => (!category || values(item, 'categories').includes(category)) && (!tag || values(item, 'tags').includes(tag)) && (!published || (published === 'published' ? item.data.published !== false : item.data.published === false))).sort((left, right) => sort === 'title-asc' ? left.title.localeCompare(right.title) : sort === 'updated-asc' ? left.mtimeMs - right.mtimeMs : right.mtimeMs - left.mtimeMs); const pages = Math.max(1, Math.ceil(visible.length / pageSize)); const activePage = Math.min(page, pages); const pageItems = visible.slice((activePage - 1) * pageSize, activePage * pageSize); const selectedItems = visible.filter(item => selected.includes(item.path)); const toggle = (path: string) => setSelected(current => current.includes(path) ? current.filter(value => value !== path) : [...current, path]); const selectAll = () => setSelected(current => pageItems.every(item => current.includes(item.path)) ? current.filter(path => !pageItems.some(item => item.path === path)) : [...new Set([...current, ...pageItems.map(item => item.path)])]); const changeFilter = (update: () => void) => { update(); setPage(1); }; return <section className="card"><div className="toolbar content-filters"><input value={query} onChange={event => changeFilter(() => onQuery(event.target.value))} placeholder="Search titles" /><select value={category} onChange={event => changeFilter(() => setCategory(event.target.value))}><option value="">All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select><select value={tag} onChange={event => changeFilter(() => setTag(event.target.value))}><option value="">All tags</option>{tags.map(name => <option key={name}>{name}</option>)}</select><select value={published} onChange={event => changeFilter(() => setPublished(event.target.value))}><option value="">All statuses</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select><select value={sort} onChange={event => changeFilter(() => setSort(event.target.value))}><option value="updated-desc">Newest updated</option><option value="updated-asc">Oldest updated</option><option value="title-asc">Title A–Z</option></select><span>{visible.length} items</span></div>{selectedItems.length ? <div className="actions bulk-actions"><span>{selectedItems.length} selected</span>{selectedItems[0].kind !== 'page' && <><button onClick={() => onTransitionMany(selectedItems)}>{selectedItems[0].kind === 'draft' ? 'Publish selected' : 'Move selected to drafts'}</button><button onClick={() => onAddTaxonomy(selectedItems, 'categories')}>Add category</button><button onClick={() => onAddTaxonomy(selectedItems, 'tags')}>Add tag</button></>}<button className="danger" onClick={() => onRecycleMany(selectedItems)}>Delete selected</button></div> : null}<table><thead><tr><th><input type="checkbox" checked={pageItems.length > 0 && pageItems.every(item => selected.includes(item.path))} onChange={selectAll} /></th><th>Title</th><th>Categories / tags</th><th>Updated</th><th /></tr></thead><tbody>{pageItems.map(item => <tr key={item.path}><td><input type="checkbox" checked={selected.includes(item.path)} onChange={() => toggle(item.path)} /></td><td><button className="text-button" onClick={() => onOpen(item)}>{item.title}</button><small>{item.path}</small></td><td>{[...values(item, 'categories'), ...values(item, 'tags')].map((value, index) => <span className="chip" key={`${value}-${index}`}>{value}</span>)}</td><td>{new Date(item.mtimeMs).toLocaleString()}</td><td><div className="actions"><button onClick={() => onOpen(item)}>Edit</button><button onClick={() => onCopy(item)}>Copy</button>{item.kind !== 'page' && <button onClick={() => onTransition(item)}>{item.kind === 'draft' ? 'Publish' : 'To draft'}</button>}<button className="danger" onClick={() => onRecycle(item)}>Delete</button></div></td></tr>)}</tbody></table>{visible.length > pageSize && <div className="pagination"><button disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>Previous</button><span>Page {activePage} of {pages}</span><button disabled={activePage === pages} onClick={() => setPage(activePage + 1)}>Next</button></div>}</section>; }
function RecycleBin({ items, onRestore, onDelete, onClear }: { items: RecycleItem[]; onRestore: (item: RecycleItem) => void; onDelete: (item: RecycleItem) => void; onClear: () => void }) { return <section className="card"><div className="toolbar"><h2>Recycle bin</h2><div className="actions"><span>{items.length} item(s)</span>{items.length ? <button className="danger" onClick={onClear}>Empty recycle bin</button> : null}</div></div>{items.length ? <table><thead><tr><th>Original path</th><th>Deleted</th><th>Files</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.ticket}><td><b>{item.kind}</b><small>{item.originalPath}</small></td><td>{new Date(item.deletedAt).toLocaleString()}</td><td>{item.items.join(', ')}</td><td><div className="actions"><button onClick={() => onRestore(item)}>Restore</button><button className="danger" onClick={() => onDelete(item)}>Delete permanently</button></div></td></tr>)}</tbody></table> : <p>No recycled content.</p>}</section>; }
function Taxonomy({ data, posts, onOpen, onManage }: { data: { categories: Array<{ name: string; count: number }>; tags: Array<{ name: string; count: number }> } | null; posts: Document[]; onOpen: (item: Document) => void; onManage: (type: 'category' | 'tag', action: 'rename' | 'merge' | 'delete', name: string) => void }) {
  const [selection, setSelection] = useState<{ type: 'category' | 'tag'; name: string } | null>(null);
  const values = (item: Document, key: 'categories' | 'tags') => Array.isArray(item.data[key]) ? item.data[key].map(String) : item.data[key] ? [String(item.data[key])] : [];
  const related = selection ? posts.filter(item => values(item, selection.type === 'category' ? 'categories' : 'tags').includes(selection.name)) : [];
  const select = (type: 'category' | 'tag', name: string) => setSelection(current => current?.type === type && current.name === name ? null : { type, name });
  return <><section className="grid two"><article className="card"><h2>Categories</h2>{data?.categories.map(item => <button className="list-row taxonomy-button" key={item.name} onClick={() => select('category', item.name)}><span>{item.name}</span><b>{item.count}</b></button>)}</article><article className="card"><h2>Tags</h2><div>{data?.tags.map(item => <button className={selection?.type === 'tag' && selection.name === item.name ? 'chip active-chip' : 'chip'} key={item.name} onClick={() => select('tag', item.name)}>{item.name} {item.count}</button>)}</div></article></section><section className="card taxonomy-results"><div className="toolbar"><div><h2>{selection ? `${selection.type === 'category' ? 'Category' : 'Tag'}: ${selection.name}` : 'Related posts'}</h2><p className="muted">{selection ? `${related.length} post(s) use this ${selection.type}.` : 'Select a category or tag to view its posts.'}</p></div>{selection && <div className="actions"><button onClick={() => onManage(selection.type, 'rename', selection.name)}>Rename</button><button onClick={() => onManage(selection.type, 'merge', selection.name)}>Merge into…</button><button className="danger" onClick={() => onManage(selection.type, 'delete', selection.name)}>Remove</button><button onClick={() => setSelection(null)}>Clear filter</button></div>}</div>{selection && (related.length ? <div className="related-posts">{related.map(item => <button className="related-post" key={item.path} onClick={() => onOpen(item)}><b>{item.title}</b><small>{item.path}</small></button>)}</div> : <p className="muted">No published posts match this item.</p>)}</section></>;
}
function Media({ editor, onUpload, onInsert }: { editor: Document | null; onUpload: (file: File) => void; onInsert: (asset: MediaAsset) => void }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [error, setError] = useState('');
  const load = async () => { if (!editor || editor.kind !== 'post') return setAssets([]); try { setAssets(await api<MediaAsset[]>(`/media?postPath=${encodeURIComponent(editor.path)}`)); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load media.'); } };
  useEffect(() => { void load(); }, [editor?.path]);
  const remove = async (asset: MediaAsset) => { if (!editor || !window.confirm(`Delete “${asset.name}”?`)) return; try { await api(`/media?postPath=${encodeURIComponent(editor.path)}&name=${encodeURIComponent(asset.name)}`, { method: 'DELETE' }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete media.'); } };
  const rename = async (asset: MediaAsset) => { if (!editor) return; const newName = window.prompt(`Rename “${asset.name}” to:`, asset.name)?.trim(); if (!newName || newName === asset.name) return; try { await api('/media/rename', { method: 'POST', body: JSON.stringify({ postPath: editor.path, name: asset.name, newName }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not rename media.'); } };
  const process = async (asset: MediaAsset, mode: 'webp' | 'thumbnail') => { if (!editor || !window.confirm(`Create ${mode === 'webp' ? 'optimized WebP' : 'thumbnail'} for “${asset.name}”? The original file will be kept.`)) return; try { const result = await api<{ markdown: string }>('/media/process', { method: 'POST', body: JSON.stringify({ postPath: editor.path, name: asset.name, mode }) }); await load(); if (mode === 'webp' && window.confirm('Insert the optimized WebP into this article?')) onInsert({ ...asset, name: result.markdown.match(/\(([^)]+)\)/)?.[1] ?? asset.name }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not process media.'); } };
  const copy = async (asset: MediaAsset) => { await navigator.clipboard?.writeText(`![${asset.name.replace(/\.[^.]+$/, '')}](${asset.name})`); };
  const mediaUrl = (asset: MediaAsset) => `/api/media/file?postPath=${encodeURIComponent(editor?.path ?? '')}&name=${encodeURIComponent(asset.name)}`;
  const image = (asset: MediaAsset) => /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.name);
  return <section className="card"><div className="toolbar"><div><h2>Post media assets</h2>{editor ? <p className="muted">Open post: <b>{editor.title}</b></p> : null}</div>{editor?.kind === 'post' && <button onClick={() => void load()}>Refresh</button>}</div>{editor?.kind === 'post' ? <><label className="dropzone">Choose an image or attachment<input type="file" onChange={event => event.target.files?.[0] && onUpload(event.target.files[0])} /></label>{error && <p className="notice">{error}</p>}{assets.length ? <table><thead><tr><th>Preview</th><th>Name</th><th>Usage</th><th>Size</th><th /></tr></thead><tbody>{assets.map(asset => <tr key={asset.path}><td>{image(asset) ? <a href={mediaUrl(asset)} target="_blank"><img className="media-thumb" src={mediaUrl(asset)} alt={asset.name} /></a> : <span>File</span>}</td><td>{asset.name}<small>{asset.path}</small></td><td>{asset.used ? 'Used' : <b className="unused-media">Unused</b>}</td><td>{Math.ceil(asset.size / 1024)} KB</td><td><div className="actions"><a href={mediaUrl(asset)} target="_blank">Open</a><button onClick={() => onInsert(asset)}>Insert</button>{image(asset) && <><button onClick={() => void process(asset, 'webp')}>Optimize WebP</button><button onClick={() => void process(asset, 'thumbnail')}>Thumbnail</button></>}<button onClick={() => void copy(asset)}>Copy Markdown</button><button onClick={() => void rename(asset)}>Rename</button><button className="danger" onClick={() => void remove(asset)}>Delete</button></div></td></tr>)}</tbody></table> : <p className="muted">No media files for this post yet.</p>}</> : <p>Open a published post in the content list first; uploaded media will be stored with that post’s assets.</p>}</section>;
}
function MediaLibrary() { const [assets, setAssets] = useState<LibraryMediaAsset[]>([]); const [selected, setSelected] = useState<string[]>([]); const [error, setError] = useState(''); const key = (asset: LibraryMediaAsset) => `${asset.postPath}:${asset.name}`; const load = async () => { try { setAssets(await api<LibraryMediaAsset[]>('/media/library')); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load media library.'); } }; useEffect(() => { void load(); }, []); const image = (asset: MediaAsset) => /\.(png|jpe?g|gif|webp)$/i.test(asset.name); const images = assets.filter(image); const toggle = (asset: LibraryMediaAsset) => setSelected(current => current.includes(key(asset)) ? current.filter(value => value !== key(asset)) : [...current, key(asset)]); const batch = async (mode: 'webp' | 'thumbnail') => { const items = images.filter(asset => selected.includes(key(asset))).map(asset => ({ postPath: asset.postPath, name: asset.name })); if (!items.length) return; try { const result = await api<{ processed: unknown[]; failed: Array<{ message: string }> }>('/media/process/batch', { method: 'POST', body: JSON.stringify({ items, mode }) }); setError(result.failed.length ? `${result.processed.length} processed; ${result.failed.length} failed: ${result.failed[0].message}` : `${result.processed.length} image(s) processed.`); setSelected([]); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not process selected images.'); } }; const url = (asset: LibraryMediaAsset) => `/api/media/file?postPath=${encodeURIComponent(asset.postPath)}&name=${encodeURIComponent(asset.name)}`; return <section className="card"><div className="toolbar"><div><h2>All post media</h2><p className="muted">Select PNG, JPEG, or WebP images for batch optimization. Originals are kept.</p></div><div className="actions"><button onClick={() => setSelected(selected.length === images.length ? [] : images.map(key))}>Select images</button><button disabled={!selected.length} onClick={() => void batch('webp')}>Optimize selected</button><button disabled={!selected.length} onClick={() => void batch('thumbnail')}>Create thumbnails</button><button onClick={() => void load()}>Refresh library</button></div></div>{error && <p className="notice">{error}</p>}{assets.length ? <table><thead><tr><th /><th>Preview</th><th>Post</th><th>Name</th><th>Usage</th><th>Size</th><th /></tr></thead><tbody>{assets.map(asset => <tr key={`${asset.postPath}/${asset.name}`}><td>{image(asset) ? <input type="checkbox" checked={selected.includes(key(asset))} onChange={() => toggle(asset)} /> : null}</td><td>{image(asset) ? <a href={url(asset)} target="_blank"><img className="media-thumb" src={url(asset)} alt={asset.name} /></a> : <span>File</span>}</td><td>{asset.postTitle}<small>{asset.postPath}</small></td><td>{asset.name}</td><td>{asset.used ? 'Used' : <b className="unused-media">Unused</b>}</td><td>{Math.ceil(asset.size / 1024)} KB</td><td><a href={url(asset)} target="_blank">Open</a></td></tr>)}</tbody></table> : <p className="muted">No post media files found.</p>}</section>; }
function ConfigEditor({ raw, onChange, onSave, common, onCommonChange, onCommonSave }: { raw: string; onChange: (value: string) => void; onSave: () => void; common?: Record<string, string>; onCommonChange?: (field: string, value: string) => void; onCommonSave?: () => void }) { const fields: Array<[string, string]> = [['title', 'Site title'], ['subtitle', 'Subtitle'], ['description', 'Description'], ['author', 'Author'], ['language', 'Language'], ['timezone', 'Timezone'], ['url', 'Site URL'], ['root', 'Root path'], ['permalink', 'Permalink'], ['per_page', 'Posts per page']]; return <section className="grid">{common && <article className="card"><div className="toolbar"><div><h2>Common settings</h2><p className="muted">Changes are validated and backed up before saving.</p></div><button className="primary" onClick={onCommonSave}>Save common settings</button></div><div className="config-fields">{fields.map(([field, label]) => <label key={field}>{label}<input value={common[field] ?? ''} onChange={event => onCommonChange?.(field, event.target.value)} /></label>)}</div></article>}<article className="card editor-card"><div className="toolbar"><div><h2>Raw YAML</h2><span>For advanced Hexo configuration.</span></div><button className="primary" onClick={onSave}>Validate and save YAML</button></div><textarea value={raw} onChange={event => onChange(event.target.value)} spellCheck={false} /></article></section>; }
function ThemeManager({ info, raw, onChange, onSave, onSelect }: { info: { theme: string; themes: string[] } | null; raw: string; onChange: (value: string) => void; onSave: () => void; onSelect: (theme: string) => void }) { return <section className="grid"><article className="card"><div className="toolbar"><div><h2>Installed themes</h2><p className="muted">Current theme: <b>{info?.theme || '—'}</b></p></div></div><div className="theme-list">{info?.themes.map(theme => <button key={theme} className={theme === info?.theme ? 'primary' : ''} onClick={() => onSelect(theme)}>{theme === info?.theme ? `${theme} (current)` : theme}</button>) ?? <p>Loading themes…</p>}</div></article><ConfigEditor raw={raw} onChange={onChange} onSave={onSave} /></section>; }
function ActivityLog({ tasks, logs }: { tasks: Task[]; logs: OperationLog[] }) { return <section className="grid"><section className="card"><h2>Operation log</h2>{logs.length ? <table><thead><tr><th>Time</th><th>Action</th><th>Result</th><th>Details</th></tr></thead><tbody>{logs.map((log, index) => <tr key={`${log.at}-${index}`}><td>{new Date(log.at).toLocaleString()}</td><td>{log.action}</td><td>{log.result}</td><td><code>{JSON.stringify(log.detail)}</code></td></tr>)}</tbody></table> : <p>No recorded operations yet.</p>}</section><TaskLogs tasks={tasks} /></section>; }
function SeoPublishSummary() { const [report, setReport] = useState<SeoReport | null>(null); useEffect(() => { api<SeoReport>('/seo?kind=post').then(setReport).catch(() => setReport(null)); }, []); return <section className="card"><h2>SEO before publishing</h2><p className="muted">{report ? `${report.warnings} warning(s) and ${report.suggestions} suggestion(s). These are advisory only and will not block deployment.` : 'Checking current published posts…'}</p></section>; }
function Publish({ status, tasks, busy, onTask, onStop }: { status: Status | null; tasks: Task[]; busy: boolean; onTask: (type: 'clean' | 'generate' | 'deploy' | 'preview') => void; onStop: () => void }) { return <section className="grid two"><article className="card"><h2>Local preview</h2><p>{status?.preview ? <a href={status.preview.url} target="_blank">Running: {status.preview.url}</a> : 'Not running'}</p>{status?.preview ? <button className="danger" disabled={busy} onClick={onStop}>Stop preview</button> : <button className="primary" disabled={busy} onClick={() => onTask('preview')}>Start preview</button>}</article><article className="card"><h2>Publishing workflow</h2><p className="muted">Commit source changes to <code>hexo</code>. Hexo deploy publishes generated files to <code>main</code>.</p><div className="actions"><button disabled={busy} onClick={() => onTask('clean')}>Clean</button><button disabled={busy} onClick={() => onTask('generate')}>Generate</button><button className="danger" disabled={busy} onClick={() => onTask('deploy')}>Deploy to main</button></div></article><TaskLogs tasks={tasks} /></section>; }
function GitDiffViewer({ diff, onClose }: { diff: string; onClose: () => void }) {
  const copy = async () => { try { await navigator.clipboard.writeText(diff); } catch { window.prompt('Copy diff', diff); } };
  return <section className="card git-diff-viewer"><div className="toolbar"><div><h2>File changes</h2><p className="muted">Green lines are additions; red lines are removals. Scroll horizontally for long lines.</p></div><div className="actions"><button onClick={() => void copy()}>Copy diff</button><button className="primary" onClick={onClose}>Back to Git</button></div></div><pre>{diff}</pre></section>;
}
function GitSafeView({ data, diff, selected, onToggle, onDiff, onRefresh, onPull, onCommit, onPush }: { data: GitInfo | null; diff: string; selected: string[]; onToggle: (file: string) => void; onDiff: (path: string) => void; onRefresh: () => void; onPull: () => void; onCommit: () => void; onPush: () => void }) {
  const [shownDiff, setShownDiff] = useState(diff);
  useEffect(() => setShownDiff(diff), [diff]);
  const conflicted = Boolean(data?.conflicts.length);
  if (shownDiff) return <GitDiffViewer diff={shownDiff} onClose={() => setShownDiff('')} />;
  return <section className="grid two"><article className="card git-summary"><div className="toolbar"><div><h2>Source branch</h2><p><b>{data?.branch ?? 'Unavailable'}</b>{data?.tracking ? ` tracking ${data.tracking}` : ' (no upstream configured)'}</p></div><button onClick={onRefresh}>Refresh</button></div><dl><dt>Remote</dt><dd>{data?.remote || 'No origin remote'}</dd><dt>Sync status</dt><dd>{data ? `${data.ahead} ahead / ${data.behind} behind` : 'Loading'}</dd><dt>Local branches</dt><dd>{data?.branches.join(', ') || 'Unavailable'}</dd></dl></article><article className="card"><h2>Working tree</h2>{conflicted ? <div className="git-conflict"><b>Conflicts block commit, pull, and push.</b><ul>{data?.conflicts.map(file => <li key={file}><code>{file}</code></li>)}</ul><small>Resolve these files in an external Git editor, then click Refresh. The panel will never overwrite a conflict.</small></div> : null}{data?.changes.length ? data.changes.map(change => { const file = change.slice(3); return <div className="git-change" key={change}><input type="checkbox" checked={selected.includes(file)} onChange={() => onToggle(file)} /><code>{change}</code><button onClick={() => onDiff(file)}>View diff</button></div>; }) : <p>No uncommitted changes.</p>}<div className="actions"><button disabled={conflicted} onClick={onPull}>Pull source branch</button><button disabled={!selected.length || conflicted} onClick={onCommit}>Commit selected</button><button className="primary" disabled={conflicted} onClick={onPush}>Push source branch</button></div></article><article className="card"><h2>Recent commits</h2>{data?.log.map(item => <div className="list-row" key={item.hash}><code>{item.hash}</code><span>{item.message}<small>{new Date(item.date).toLocaleString()}</small></span></div>)}</article>{diff && <article className="card git-diff"><h2>Selected file diff</h2><pre>{diff}</pre></article>}</section>;
}
function GitView({ data, diff, onDiff, onRefresh, onPull, onCommit, onPush }: { data: GitInfo | null; diff: string; onDiff: (path: string) => void; onRefresh: () => void; onPull: () => void; onCommit: (paths: string[], message: string) => void; onPush: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected((data?.changes ?? []).map(change => change.slice(3)).filter(Boolean)), [data]);
  const toggle = (file: string) => setSelected(current => current.includes(file) ? current.filter(value => value !== file) : [...current, file]);
  const commit = () => { const message = window.prompt(`Commit ${selected.length} selected file(s)`); if (message && selected.length) onCommit(selected, message); };
  return <GitSafeView data={data} diff={diff} selected={selected} onToggle={toggle} onDiff={onDiff} onRefresh={onRefresh} onPull={onPull} onCommit={commit} onPush={onPush} />;
  return <section className="grid two"><article className="card"><div className="toolbar"><h2>Working tree · {data?.branch ?? '—'}</h2><button onClick={onRefresh}>Refresh</button></div>{data?.conflicts.length ? <div className="git-conflict"><b>Conflicts block commit and push.</b><p>{data.conflicts.join(', ')}</p><small>Resolve the marked files in an external Git editor, save them, then click Refresh. The panel will not overwrite conflicts automatically.</small></div> : null}{data?.changes.length ? data.changes.map(change => { const file = change.slice(3); return <div className="git-change" key={change}><input type="checkbox" checked={selected.includes(file)} onChange={() => toggle(file)} /><code>{change}</code><button onClick={() => onDiff(file)}>View diff</button></div>; }) : <p>No uncommitted changes.</p>}<div className="actions"><button onClick={onPull}>Pull source branch</button><button disabled={!selected.length || Boolean(data?.conflicts.length)} onClick={commit}>Commit selected</button><button className="primary" disabled={Boolean(data?.conflicts.length)} onClick={onPush}>Push source branch</button></div></article><article className="card"><h2>Recent commits</h2>{data?.log.map(item => <div className="list-row" key={item.hash}><code>{item.hash}</code><span>{item.message}<small>{new Date(item.date).toLocaleString()}</small></span></div>)}</article>{diff && <article className="card git-diff"><h2>Selected file diff</h2><pre>{diff}</pre></article>}</section>;
}
function TaskLogs({ tasks }: { tasks: Task[] }) { return <section className="card task-log"><h2>Task logs</h2>{tasks.length ? tasks.map(task => <details key={task.id}><summary><b>{task.type}</b> · {task.status} · {new Date(task.startedAt).toLocaleTimeString()}</summary><pre>{task.stdout || task.stderr || 'Awaiting output...'}</pre></details>) : <p>No tasks yet.</p>}</section>; }
function Editor({ item, onChange, onSave, onRename, onClose, onUpload }: { item: Document; onChange: (item: Document) => void; onSave: () => void; onRename: (item: Document) => void; onClose: () => void; onUpload: (file: File) => void }) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  useEffect(() => {
    // An editor is a focused workspace: never let wheel/touch scrolling leak
    // through the fixed dialog to the article list underneath it.
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
    };
  }, []);
  const setData = (key: string, value: unknown) => onChange({ ...item, data: { ...item.data, [key]: value } });
  const arrayField = (key: 'categories' | 'tags') => (Array.isArray(item.data[key]) ? item.data[key] : item.data[key] ? [item.data[key]] : []).join(', ');
  const importImage = (files: FileList) => { const file = [...files].find(candidate => candidate.type.startsWith('image/')); if (file) onUpload(file); };
  const characters = item.body.replace(/\s/g, '').length;
  const words = item.body.trim() ? item.body.trim().split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.ceil(characters / 500));
  return <div className="modal"><div className="editor-modal"><div className="modal-head"><div><b>{item.title}</b><small>{item.path}</small></div><div>{item.kind === 'page' && <button onClick={() => onRename(item)}>Change path</button>}<button onClick={onSave}>Save</button><button className="primary" onClick={onClose}>Done</button></div></div><div className="editor-layout"><aside className="properties"><label>Title<input value={String(item.data.title ?? item.title)} onChange={event => setData('title', event.target.value)} /></label>{item.kind !== 'page' && <><label>Categories<input value={arrayField('categories')} onChange={event => setData('categories', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></label><label>Tags<input value={arrayField('tags')} onChange={event => setData('tags', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></label><label>Publish date<input value={String(item.data.date ?? '')} placeholder="YYYY-MM-DD HH:mm:ss" onChange={event => setData('date', event.target.value)} /></label><label>Updated date<input value={String(item.data.updated ?? '')} placeholder="YYYY-MM-DD HH:mm:ss" onChange={event => setData('updated', event.target.value)} /></label><label>Summary<input value={String(item.data.excerpt ?? '')} onChange={event => setData('excerpt', event.target.value)} /></label><label>Permalink<input value={String(item.data.permalink ?? '')} onChange={event => setData('permalink', event.target.value)} /></label><label className="checkbox-field"><input type="checkbox" checked={Boolean(item.data.top)} onChange={event => setData('top', event.target.checked)} /> Pin to top</label><label className="checkbox-field"><input type="checkbox" checked={item.data.published !== false} onChange={event => setData('published', event.target.checked)} /> Published</label></>}{item.kind === 'page' && <><label>Layout<input value={String(item.data.layout ?? '')} onChange={event => setData('layout', event.target.value)} /></label><label>Show in navigation<select value={String(item.data.menu ?? 'true')} onChange={event => setData('menu', event.target.value === 'true')}><option value="true">Yes</option><option value="false">No</option></select></label></>}<label>Cover image<input value={String(item.data.cover ?? '')} onChange={event => setData('cover', event.target.value)} /></label><label className="file-button">Upload image<input type="file" accept="image/*" onChange={event => event.target.files?.[0] && onUpload(event.target.files[0])} /></label><small>{characters} characters · {words} words · about {minutes} min read</small><small>Autosaves source after two seconds. Use Ctrl+S to save now.</small></aside><section className="editor-workspace" onPaste={event => importImage(event.clipboardData.files)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); importImage(event.dataTransfer.files); }}><div className="editor-tabs"><button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit Markdown</button><button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>Preview</button></div>{mode === 'edit' ? <MarkdownEditor key={item.path} value={item.body} onChange={body => onChange({ ...item, body })} onSave={onSave} /> : <article className="preview"><h3>{String(item.data.title ?? item.title)}</h3><p className="muted">{arrayField('categories')}</p><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ src, alt }) => <img src={previewMediaUrl(src ?? '', item.path)} alt={alt ?? ''} /> }}>{item.body}</ReactMarkdown></article>}</section></div></div></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
