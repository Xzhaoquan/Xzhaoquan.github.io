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
const context = await ProjectContext.open(defaultRoot);

await app.register(cors, { origin: /^http:\/\/127\.0\.0\.1(?::\d+)?$/ });
await app.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });

const kindSchema = z.enum(['post', 'draft', 'page']);
const contentSchema = z.object({ data: z.record(z.unknown()), body: z.string(), hash: z.string().optional() });
const createSchema = z.object({ title: z.string().min(1).max(160), filename: z.string().max(180).optional(), data: z.record(z.unknown()).optional(), body: z.string().optional() });
const commonConfigSchema = z.object({ values: z.object({ title: z.string().optional(), subtitle: z.string().optional(), description: z.string().optional(), author: z.string().optional(), language: z.string().optional(), timezone: z.string().optional(), url: z.string().optional(), root: z.string().optional(), permalink: z.string().optional(), per_page: z.string().optional() }) });

function kind(value: unknown): ContentKind { return kindSchema.parse(value); }
function success(data: unknown) { return { ok: true, data }; }

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) return reply.code(error.code === 'EXTERNAL_MODIFICATION' ? 409 : 400).send({ ok: false, error: { code: error.code, message: error.message, changed: error.changed, recovery: error.recovery } });
  if (error instanceof z.ZodError) return reply.code(400).send({ ok: false, error: { code: 'INVALID_REQUEST', message: error.issues[0]?.message ?? '请求参数不正确。', changed: false } });
  return reply.code(500).send({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Backend operation failed.', changed: false, recovery: error instanceof Error ? error.message : undefined } });
});

app.get('/api/project/status', async () => success(await context.status()));
app.get('/api/content/:kind', async request => success(await context.listContent(kind((request.params as { kind: string }).kind))));
app.get('/api/content/:kind/read', async request => { const query = request.query as { path?: string }; if (!query.path) throw new AppError('INVALID_PATH', '缺少文件路径。'); return success(await context.getContent(kind((request.params as { kind: string }).kind), query.path)); });
app.post('/api/content/:kind', async request => success(await context.createContent(kind((request.params as { kind: string }).kind), createSchema.parse(request.body))));
app.put('/api/content/:kind', async request => { const query = request.query as { path?: string }; if (!query.path) throw new AppError('INVALID_PATH', '缺少文件路径。'); return success(await context.saveContent(kind((request.params as { kind: string }).kind), query.path, contentSchema.parse(request.body))); });
app.post('/api/content/:kind/recycle', async request => { const body = z.object({ path: z.string(), includeAssets: z.boolean().default(true) }).parse(request.body); return success(await context.moveToRecycle(kind((request.params as { kind: string }).kind), body.path, body.includeAssets)); });
app.get('/api/recycle', async () => success(await context.listRecycle()));
app.post('/api/recycle/:ticket/restore', async request => success(await context.restoreRecycle((request.params as { ticket: string }).ticket)));
app.delete('/api/recycle/:ticket', async request => { await context.deleteRecycle((request.params as { ticket: string }).ticket); return success({ deleted: true }); });
app.post('/api/content/:kind/transition', async request => { const params = request.params as { kind: string }; const from = kind(params.kind); const body = z.object({ path: z.string(), to: z.enum(['post', 'draft']) }).parse(request.body); if (from === 'page' || from === body.to) throw new AppError('INVALID_CONTENT_TRANSITION', 'Only posts and drafts can be moved between these states.'); return success(await context.transitionContent(from, body.to, body.path)); });

app.get('/api/taxonomy', async () => success(await context.taxonomy()));
app.patch('/api/taxonomy/:field', async request => { const field = z.enum(['categories', 'tags']).parse((request.params as { field: string }).field); const body = z.object({ action: z.enum(['rename', 'delete']), name: z.string().min(1), replacement: z.string().optional() }).parse(request.body); return success(await context.updateTaxonomy(field, body.action, body.name, body.replacement)); });
app.get('/api/media', async request => { const query = request.query as { postPath?: string }; if (!query.postPath) throw new AppError('INVALID_PATH', '缺少文章路径。'); return success(await context.mediaFor(query.postPath)); });
app.post('/api/media/upload', async request => {
  const data = await request.file(); if (!data) throw new AppError('NO_FILE', '请选择需要上传的文件。');
  const postPath = String((data.fields as Record<string, { value?: unknown }>).postPath?.value ?? ''); if (!postPath) throw new AppError('INVALID_PATH', 'Missing article path.');
  const chunks: Buffer[] = []; data.file.on('data', chunk => chunks.push(chunk)); await new Promise<void>((resolve, reject) => { data.file.on('end', resolve); data.file.on('error', reject); });
  return success(await context.uploadMedia(postPath, data.filename, Buffer.concat(chunks)));
});
app.delete('/api/media', async request => { const query = z.object({ postPath: z.string().min(1), name: z.string().min(1) }).parse(request.query); await context.deleteMedia(query.postPath, query.name); return success({ deleted: true }); });

app.get('/api/config', async () => success(await context.readYaml('_config.yml')));
app.put('/api/config', async request => { const body = z.object({ raw: z.string() }).parse(request.body); await context.saveYaml('_config.yml', body.raw); return success(await context.readYaml('_config.yml')); });
app.get('/api/config/common', async () => success(await context.commonConfig()));
app.put('/api/config/common', async request => success(await context.saveCommonConfig(commonConfigSchema.parse(request.body).values)));
app.get('/api/theme', async () => { const themes = await context.themes(); return success({ theme: themes.current, themes: themes.installed, config: await context.readYaml(`themes/${themes.current}/_config.yml`) }); });
app.put('/api/theme', async request => { const config = await context.readYaml('_config.yml'); const body = z.object({ raw: z.string() }).parse(request.body); const relative = `themes/${String(config.value.theme ?? '')}/_config.yml`; await context.saveYaml(relative, body.raw); return success(await context.readYaml(relative)); });
app.post('/api/theme/select', async request => success(await context.selectTheme(z.object({ theme: z.string().min(1) }).parse(request.body).theme)));

app.get('/api/logs', async request => { const query = request.query as { limit?: string }; const limit = Math.min(500, Math.max(1, Number(query.limit ?? 100) || 100)); return success(await context.listOperationLogs(limit)); });

app.get('/api/tasks', async () => success([...context.tasks.values()].reverse()));
app.post('/api/tasks/:type', async request => { const params = request.params as { type: string }; const body = z.object({ confirmed: z.boolean().optional(), port: z.number().int().min(1024).max(65535).optional() }).parse(request.body ?? {}); if (!['clean', 'generate', 'deploy', 'preview'].includes(params.type)) throw new AppError('TASK_FORBIDDEN', '该命令不在允许的任务列表内。'); return success(await context.runTask(params.type as 'clean' | 'generate' | 'deploy' | 'preview', body.confirmed, body.port)); });
app.post('/api/preview/stop', async () => success(await context.stopPreview()));

app.get('/api/git/status', async () => { const [status, branch, log] = await Promise.all([context.git(['status', '--porcelain=v1']), context.git(['branch', '--show-current']), context.git(['log', '-8', '--pretty=format:%h%x09%s%x09%ci'])]); const changes = status.stdout.split('\n').filter(Boolean); const conflicts = changes.filter(line => /^[ADU][ADU]|^UU/.test(line.slice(0, 2))).map(line => line.slice(3)); return success({ branch: branch.stdout.trim(), changes, conflicts, log: log.stdout.split('\n').filter(Boolean).map(line => { const [hash, message, date] = line.split('\t'); return { hash, message, date }; }) }); });
app.get('/api/git/diff', async request => { const query = request.query as { path?: string }; const args = ['diff', '--']; if (query.path) args.push(query.path); return success(await context.git(args)); });
app.post('/api/git/commit', async request => { const body = z.object({ paths: z.array(z.string()).min(1), message: z.string().min(1).max(240), confirmed: z.boolean() }).parse(request.body); if (!body.confirmed) throw new AppError('CONFIRMATION_REQUIRED', '提交 Git 变更需要确认。'); const add = await context.git(['add', '--', ...body.paths]); if (add.code !== 0) throw new AppError('GIT_ADD_FAILED', add.stderr || add.stdout); const commit = await context.git(['commit', '-m', body.message]); if (commit.code !== 0) throw new AppError('GIT_COMMIT_FAILED', commit.stderr || commit.stdout); return success(commit); });
app.post('/api/git/:operation', async request => { const operation = (request.params as { operation: string }).operation; const body = z.object({ confirmed: z.boolean() }).parse(request.body); if (!body.confirmed) throw new AppError('CONFIRMATION_REQUIRED', 'Git 远端操作需要确认。'); if (!['pull', 'push'].includes(operation)) throw new AppError('GIT_OPERATION_FORBIDDEN', '不允许该 Git 操作。'); const result = await context.git([operation]); if (result.code !== 0) throw new AppError(`GIT_${operation.toUpperCase()}_FAILED`, result.stderr || result.stdout, false, '请在外部 Git 工具中处理冲突后重试。'); return success(result); });

const clientDist = path.resolve(here, '../dist');
try { await fs.access(clientDist); await app.register(staticFiles, { root: clientDist, wildcard: false }); app.get('/*', async (_request, reply) => reply.sendFile('index.html')); } catch { /* Vite dev server serves the client. */ }

await app.listen({ host: '127.0.0.1', port: Number(process.env.HEXO_ADMIN_PORT ?? 4190) });
console.log(`Hexo Admin API: http://127.0.0.1:${process.env.HEXO_ADMIN_PORT ?? 4190}`);
