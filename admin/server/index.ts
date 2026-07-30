import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { z } from 'zod';
import { AppError, ProjectContext } from './core.js';
import type { ContentKind } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = process.env.HEXO_PROJECT_ROOT ?? path.resolve(here, '../..');
const app = Fastify({ logger: false });
let context = await ProjectContext.open(defaultRoot);

await app.register(cors, { origin: /^http:\/\/127\.0\.0\.1(?::\d+)?$/ });
await app.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });

const kindSchema = z.enum(['post', 'draft', 'page']);
const contentSchema = z.object({ data: z.record(z.unknown()), body: z.string(), hash: z.string().optional() });
const createSchema = z.object({ title: z.string().min(1).max(160), filename: z.string().max(180).optional(), data: z.record(z.unknown()).optional(), body: z.string().optional() });
const commonConfigSchema = z.object({ values: z.object({ title: z.string().optional(), subtitle: z.string().optional(), description: z.string().optional(), author: z.string().optional(), language: z.string().optional(), timezone: z.string().optional(), url: z.string().optional(), root: z.string().optional(), permalink: z.string().optional(), per_page: z.string().optional() }) });
const themeProfileSchema = z.object({ enabled: z.boolean(), articleSelfBlock: z.boolean(), avatar: z.string().max(500), gravatar: z.string().max(320), author: z.string().max(160), author_title: z.string().max(240), author_description: z.string().max(2000), location: z.string().max(240) });

function kind(value: unknown): ContentKind { return kindSchema.parse(value); }
function success(data: unknown) { return { ok: true, data }; }
async function publishDueSchedules() {
  const result = await context.publishDueDrafts();
  if (result.published.length || result.failed.length) app.log.info({ scheduledPublish: result }, 'scheduled drafts checked');
  return result;
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) return reply.code(error.code === 'EXTERNAL_MODIFICATION' ? 409 : 400).send({ ok: false, error: { code: error.code, message: error.message, changed: error.changed, recovery: error.recovery } });
  if (error instanceof z.ZodError) return reply.code(400).send({ ok: false, error: { code: 'INVALID_REQUEST', message: error.issues[0]?.message ?? '请求参数不正确。', changed: false } });
  return reply.code(500).send({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Backend operation failed.', changed: false, recovery: error instanceof Error ? error.message : undefined } });
});

app.get('/api/project/status', async () => success(await context.status()));
app.post('/api/project/open', async request => {
  const root = z.object({ root: z.string().min(1).max(1024) }).parse(request.body).root;
  const current = await context.status();
  if (current.preview) throw new AppError('PREVIEW_RUNNING', 'Stop the local preview before changing projects.');
  const next = await ProjectContext.open(root);
  context = next;
  void publishDueSchedules();
  return success(await context.status());
});
app.get('/api/content/:kind', async request => success(await context.listContent(kind((request.params as { kind: string }).kind))));
app.get('/api/content/:kind/read', async request => { const query = request.query as { path?: string }; if (!query.path) throw new AppError('INVALID_PATH', '缺少文件路径。'); return success(await context.getContent(kind((request.params as { kind: string }).kind), query.path)); });
app.post('/api/content/:kind', async request => success(await context.createContent(kind((request.params as { kind: string }).kind), createSchema.parse(request.body))));
app.post('/api/content/:kind/copy', async request => { const body = z.object({ path: z.string(), title: z.string().min(1).max(160), filename: z.string().max(180).optional() }).parse(request.body); return success(await context.copyContent(kind((request.params as { kind: string }).kind), body.path, body)); });
app.post('/api/content/:kind/rename', async request => { const body = z.object({ path: z.string(), targetPath: z.string().min(1).max(300) }).parse(request.body); return success(await context.renameContent(kind((request.params as { kind: string }).kind), body.path, body.targetPath)); });
app.put('/api/content/:kind', async request => { const query = request.query as { path?: string }; if (!query.path) throw new AppError('INVALID_PATH', '缺少文件路径。'); return success(await context.saveContent(kind((request.params as { kind: string }).kind), query.path, contentSchema.parse(request.body))); });
app.post('/api/content/:kind/recycle', async request => { const body = z.object({ path: z.string(), includeAssets: z.boolean().default(true) }).parse(request.body); return success(await context.moveToRecycle(kind((request.params as { kind: string }).kind), body.path, body.includeAssets)); });
app.get('/api/recycle', async () => success(await context.listRecycle()));
app.post('/api/recycle/clear', async () => success(await context.clearRecycle()));
app.post('/api/recycle/:ticket/restore', async request => success(await context.restoreRecycle((request.params as { ticket: string }).ticket)));
app.delete('/api/recycle/:ticket', async request => { await context.deleteRecycle((request.params as { ticket: string }).ticket); return success({ deleted: true }); });
app.post('/api/content/:kind/transition', async request => { const params = request.params as { kind: string }; const from = kind(params.kind); const body = z.object({ path: z.string(), to: z.enum(['post', 'draft']) }).parse(request.body); if (from === 'page' || from === body.to) throw new AppError('INVALID_CONTENT_TRANSITION', 'Only posts and drafts can be moved between these states.'); return success(await context.transitionContent(from, body.to, body.path)); });
app.get('/api/schedule', async () => success(await context.scheduledDrafts()));
app.post('/api/schedule', async request => { const body = z.object({ path: z.string(), publishAt: z.string().optional() }).parse(request.body); return success(await context.scheduleDraft(body.path, body.publishAt)); });
app.post('/api/schedule/check', async () => success(await context.publishDueDrafts()));
app.get('/api/seo', async request => { const query = request.query as { kind?: string }; return success(await context.seo(query.kind === 'draft' ? 'draft' : query.kind === 'post' ? 'post' : undefined)); });
app.get('/api/seo/article', async request => { const query = z.object({ kind: z.enum(['post', 'draft']), path: z.string().min(1) }).parse(request.query); return success(await context.seoArticle(query.kind, query.path)); });
app.patch('/api/seo/article', async request => { const body = z.object({ kind: z.enum(['post', 'draft']), path: z.string().min(1), action: z.enum(['summary', 'date', 'image-alt', 'all']) }).parse(request.body); return success(await context.fixSeoArticle(body.kind, body.path, body.action)); });
app.post('/api/seo/fix-all', async () => success(await context.fixAllSeo()));

app.get('/api/taxonomy', async () => success(await context.taxonomy()));
app.patch('/api/taxonomy/:field', async request => { const field = z.enum(['categories', 'tags']).parse((request.params as { field: string }).field); const body = z.object({ action: z.enum(['rename', 'delete']), name: z.string().min(1), replacement: z.string().optional() }).parse(request.body); return success(await context.updateTaxonomy(field, body.action, body.name, body.replacement)); });
app.get('/api/media', async request => { const query = request.query as { postPath?: string }; if (!query.postPath) throw new AppError('INVALID_PATH', '缺少文章路径。'); return success(await context.mediaFor(query.postPath)); });
app.get('/api/media/library', async () => success(await context.mediaLibrary()));
app.post('/api/media/upload', async request => {
  const data = await request.file(); if (!data) throw new AppError('NO_FILE', '请选择需要上传的文件。');
  const postPath = String((data.fields as Record<string, { value?: unknown }>).postPath?.value ?? ''); if (!postPath) throw new AppError('INVALID_PATH', 'Missing article path.');
  const chunks: Buffer[] = []; data.file.on('data', chunk => chunks.push(chunk)); await new Promise<void>((resolve, reject) => { data.file.on('end', resolve); data.file.on('error', reject); });
  return success(await context.uploadMedia(postPath, data.filename, Buffer.concat(chunks)));
});
app.delete('/api/media', async request => { const query = z.object({ postPath: z.string().min(1), name: z.string().min(1) }).parse(request.query); await context.deleteMedia(query.postPath, query.name); return success({ deleted: true }); });
app.post('/api/media/rename', async request => { const body = z.object({ postPath: z.string().min(1), name: z.string().min(1), newName: z.string().min(1) }).parse(request.body); return success(await context.renameMedia(body.postPath, body.name, body.newName)); });
app.post('/api/media/process', async request => { const body = z.object({ postPath: z.string().min(1), name: z.string().min(1), mode: z.enum(['webp', 'thumbnail']), quality: z.number().int().min(40).max(95).optional() }).parse(request.body); return success(await context.processMedia(body.postPath, body.name, body.mode, body.quality)); });
app.post('/api/media/process/batch', async request => { const body = z.object({ items: z.array(z.object({ postPath: z.string().min(1), name: z.string().min(1) })).min(1).max(100), mode: z.enum(['webp', 'thumbnail']), quality: z.number().int().min(40).max(95).optional() }).parse(request.body); return success(await context.processMediaBatch(body.items, body.mode, body.quality)); });
app.get('/api/media/file', async (request, reply) => { const query = z.object({ postPath: z.string().min(1), name: z.string().min(1) }).parse(request.query); const media = await context.readMedia(query.postPath, query.name); const extension = path.extname(media.name).toLowerCase(); const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' }; return reply.type(types[extension] ?? 'application/octet-stream').send(media.bytes); });

app.get('/api/config', async () => success(await context.readYaml('_config.yml')));
app.put('/api/config', async request => { const body = z.object({ raw: z.string() }).parse(request.body); await context.saveYaml('_config.yml', body.raw); return success(await context.readYaml('_config.yml')); });
app.get('/api/config/common', async () => success(await context.commonConfig()));
app.put('/api/config/common', async request => success(await context.saveCommonConfig(commonConfigSchema.parse(request.body).values)));
app.get('/api/theme', async () => { const themes = await context.themes(); return success({ theme: themes.current, themes: themes.installed, config: await context.readYaml(`themes/${themes.current}/_config.yml`) }); });
app.put('/api/theme', async request => { const config = await context.readYaml('_config.yml'); const body = z.object({ raw: z.string() }).parse(request.body); const relative = `themes/${String(config.value.theme ?? '')}/_config.yml`; await context.saveYaml(relative, body.raw); return success(await context.readYaml(relative)); });
app.post('/api/theme/select', async request => success(await context.selectTheme(z.object({ theme: z.string().min(1) }).parse(request.body).theme)));
app.get('/api/theme/profile', async () => success(await context.themeProfile()));
app.put('/api/theme/profile', async request => success(await context.saveThemeProfile(themeProfileSchema.parse(request.body))));

app.get('/api/logs', async request => { const query = request.query as { limit?: string }; const limit = Math.min(500, Math.max(1, Number(query.limit ?? 100) || 100)); return success(await context.listOperationLogs(limit)); });

app.get('/api/tasks', async () => success([...context.tasks.values()].reverse()));
app.get('/api/deploy/check', async () => success(await context.deploymentCheck()));
app.post('/api/tasks/:type', async request => { const params = request.params as { type: string }; const body = z.object({ confirmed: z.boolean().optional(), port: z.number().int().min(1024).max(65535).optional() }).parse(request.body ?? {}); if (!['clean', 'generate', 'deploy', 'preview'].includes(params.type)) throw new AppError('TASK_FORBIDDEN', '该命令不在允许的任务列表内。'); return success(await context.runTask(params.type as 'clean' | 'generate' | 'deploy' | 'preview', body.confirmed, body.port)); });
app.post('/api/preview/stop', async () => success(await context.stopPreview()));

app.get('/api/git/status', async () => success(await context.gitOverview()));
app.get('/api/git/diff', async request => { const query = request.query as { path?: string }; const args = ['diff', '--']; if (query.path) args.push(query.path); return success(await context.git(args)); });
app.post('/api/git/commit', async request => { const body = z.object({ paths: z.array(z.string()).min(1), message: z.string().min(1).max(240), confirmed: z.boolean() }).parse(request.body); if (!body.confirmed) throw new AppError('CONFIRMATION_REQUIRED', '提交 Git 变更需要确认。'); const overview = await context.gitOverview(); if (overview.conflicts.length) throw new AppError('GIT_CONFLICTS', `Resolve ${overview.conflicts.length} conflicted file(s) in an external Git editor before committing.`, false, 'Refresh the Git page after resolving the files.'); const add = await context.git(['add', '--', ...body.paths]); if (add.code !== 0) throw new AppError('GIT_ADD_FAILED', add.stderr || add.stdout); const commit = await context.git(['commit', '-m', body.message]); if (commit.code !== 0) throw new AppError('GIT_COMMIT_FAILED', commit.stderr || commit.stdout); return success(commit); });
app.post('/api/git/:operation', async request => { const operation = (request.params as { operation: string }).operation; const body = z.object({ confirmed: z.boolean() }).parse(request.body); if (!body.confirmed) throw new AppError('CONFIRMATION_REQUIRED', 'Git 远端操作需要确认。'); if (!['pull', 'push'].includes(operation)) throw new AppError('GIT_OPERATION_FORBIDDEN', '不允许该 Git 操作。'); const overview = await context.gitOverview(); if (overview.conflicts.length) throw new AppError('GIT_CONFLICTS', `Resolve ${overview.conflicts.length} conflicted file(s) in an external Git editor before ${operation}ing.`, false, 'Refresh the Git page after resolving the files.'); const result = await context.git([operation]); if (result.code !== 0) throw new AppError(`GIT_${operation.toUpperCase()}_FAILED`, result.stderr || result.stdout, false, '请在外部 Git 工具中处理冲突后重试。'); return success(result); });

const clientDist = path.resolve(here, '../dist');
try {
  await fs.access(clientDist);
  // Vite emits hashed bundles below /assets. Register that directory explicitly
  // before the SPA fallback, otherwise a request for a JavaScript bundle is
  // answered with index.html and the production panel renders blank.
  await app.register(staticFiles, { root: path.join(clientDist, 'assets'), prefix: '/assets/' });
  app.get('/*', async (_request, reply) => reply.type('text/html; charset=utf-8').send(await fs.readFile(path.join(clientDist, 'index.html'), 'utf8')));
} catch { /* Vite dev server serves the client. */ }

// Scheduled publishing is deliberately local: a closed admin panel does not
// create an operating-system task. The startup check publishes overdue drafts.
await publishDueSchedules();
const scheduleTimer = setInterval(() => { void publishDueSchedules(); }, 60_000);
scheduleTimer.unref();
app.addHook('onClose', async () => clearInterval(scheduleTimer));
await app.listen({ host: '127.0.0.1', port: Number(process.env.HEXO_ADMIN_PORT ?? 4190) });
console.log(`Hexo Admin API: http://127.0.0.1:${process.env.HEXO_ADMIN_PORT ?? 4190}`);
