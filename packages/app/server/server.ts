import { resolve } from 'node:path';
import { files, server } from '@databricks/appkit';
import { appkit, loadBrandContext } from '@dbx-tools/appkit';
import { agents, genie, mastra } from '@dbx-tools/appkit-mastra';
import type { TopicMessage } from '@dbx-tools/postgres';
import { log, toError } from '@dbx-tools/shared-core';
import { authGate, clientIp, isTunnelHost, tunnelInterceptor } from '@dbx-tools/tunnel';
import { z } from 'zod';
import { ACTIVITY_TOPIC, activityBus, publishActivity } from './activity.ts';
import {
  deleteCategoryAndRefresh,
  ensureDemoCategories,
  provisionCategoryFromPrompt,
  renameCategoryAndRefresh,
} from './category-provisioner.ts';
import { config } from './config.ts';
import { database } from './database.ts';
import { migrateRegistry } from './migrations.ts';
import { quickImageGate } from './model-gateway.ts';
import { createOperation, listOperationEvents, subscribeOperation } from './operations.ts';
import { deletePrompt, getCategory, getSchemaVersion, listCategories, setCategoryCaptureGuide } from './registry.ts';
import {
  ACTIVITY_IMAGE_PREVIEW_ROUTE,
  MobileViewActivityRequestSchema,
  CategoryDeleteRequestSchema,
  CategoryRenameRequestSchema,
  CategoryResolveRequestSchema,
  CaptureGuideRequestSchema,
  ImageUploadRequestSchema,
  type CaptureActivityContext,
  type DeviceActivityContext,
  type OperationEvent,
  type UploadResponse,
} from '../shared/vision-contracts.ts';

const TUNNEL_ENABLED = Boolean(process.env.TUNNEL_PUBLIC_DOMAIN);
const SOURCE_IMAGE_VOLUME_KEY = 'files';
const logger = log.logger('vision-flow');
const UuidSchema = z.string().uuid();
const StoredImagePathSchema = z
  .string()
  .max(500)
  .regex(/^[a-z][a-z0-9_]{2,47}\/v[1-9][0-9]*\/[0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[0-9a-f-]{36}\.(?:jpg|png)$/);
const mastraPostgres = {
  host: config.pgHost,
  port: config.pgPort,
  database: config.lakebaseDatabase,
  user: config.pgUser,
  password: config.pgPassword,
  ssl: config.pgSslMode === 'disable' ? false : { rejectUnauthorized: true },
  max: 4,
  idleTimeoutMillis: 30_000,
};
const visionDataAssistant = agents.createAgent({
  name: 'Vision Flow data assistant',
  description: 'Answers questions about schema-defined image extraction results published to the curated Genie space.',
  instructions: [
    'You answer questions about scans processed by the Vision Flow application.',
    'Use the configured Genie tools for every question about scanned images, counts, nested fields, confidence, review status, or processing results.',
    'Use the extraction schema registry view to discover the correct payload field path before querying schema-specific values.',
    'Treat Genie and its generated SQL as the source of truth. Never invent rows, field values, scan outcomes, or processing status.',
    'State when the available tables do not contain enough information. Mention review flags or low-confidence fields when they affect the answer.',
    genie.GENIE_INSTRUCTIONS,
  ].join('\n\n'),
  async tools(plugins) {
    const genieTools = await plugins.genie?.toolkit({ prefix: '' });
    return { ...(genieTools ?? {}) };
  },
  storage: { ...mastraPostgres, schemaName: 'mastra_vision_data' },
  memory: { ...mastraPostgres, schemaName: 'mastra_vision_memory' },
});

interface EncodedImage {
  contents: Buffer;
  extension: 'jpg' | 'png';
}

function decodeImageDataUrl(imageDataUrl: string): EncodedImage {
  const [metadata, encoded] = imageDataUrl.split(',', 2);
  if (!metadata || !encoded) throw new Error('The captured image is incomplete.');
  return {
    contents: Buffer.from(encoded, 'base64'),
    extension: metadata.includes('image/png') ? 'png' : 'jpg',
  };
}

function uploadPath(
  slug: string,
  schemaVersion: number,
  uploadId: string,
  extension: EncodedImage['extension']
): string {
  const capturedAt = new Date();
  const datePath = [
    capturedAt.getUTCFullYear(),
    String(capturedAt.getUTCMonth() + 1).padStart(2, '0'),
    String(capturedAt.getUTCDate()).padStart(2, '0'),
  ].join('/');
  return `${slug}/v${schemaVersion}/${datePath}/${uploadId}.${extension}`;
}

function sendSse(response: { write(chunk: string): boolean }, event: OperationEvent): void {
  response.write(`id: ${event.sequence}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`);
}

function sendActivitySse(response: { write(chunk: string): boolean }, event: TopicMessage): void {
  response.write(`id: ${event.id}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
}

type ActivityMetadata = Record<string, string | number | boolean | null>;

function maskedClientIp(request: Parameters<typeof clientIp>[0]): string | undefined {
  if (isTunnelHost(request, process.env.TUNNEL_PUBLIC_DOMAIN)) return undefined;
  const value = clientIp(request).replace(/^::ffff:/, '');
  if (value === 'unknown') return undefined;
  if (value === '::1' || value.startsWith('127.')) return 'Local';
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value)) {
    return `${value.split('.').slice(0, 3).join('.')}.xxx`;
  }
  if (value.includes(':')) {
    const prefix = value.split(':').filter(Boolean).slice(0, 4).join(':');
    return prefix ? `${prefix}::` : undefined;
  }
  return undefined;
}

function activityMetadata(
  request: Parameters<typeof clientIp>[0],
  context?: DeviceActivityContext | CaptureActivityContext
): ActivityMetadata {
  const metadata: ActivityMetadata = {};
  const ip = maskedClientIp(request);
  const userAgent = request.headers['user-agent'];
  if (ip) metadata.clientIp = ip;
  if (typeof userAgent === 'string') metadata.userAgent = userAgent.slice(0, 500);
  if (!context) return metadata;
  metadata.captureSessionId = context.captureSessionId;
  metadata.browser = context.browser;
  metadata.platform = context.platform;
  metadata.mobile = context.mobile;
  metadata.viewportWidth = context.width;
  metadata.viewportHeight = context.height;
  metadata.devicePixelRatio = context.devicePixelRatio;
  metadata.displayMode = context.displayMode;
  if ('source' in context) metadata.captureSource = context.source;
  return metadata;
}

function recordActivity(
  type: string,
  body: { summary: string; [key: string]: string | number | boolean | null },
  metadata: ActivityMetadata = {}
): void {
  void publishActivity(type, body, metadata).catch((error) => {
    logger.error('activity publish failed', { error: toError(error), type });
  });
}

await migrateRegistry(database);
await ensureDemoCategories();

// branding/brand.json: also read by createApp and Mastra.
const brand = await loadBrandContext();

await appkit.createApp({
  interceptor: [
    tunnelInterceptor(),
    (context) => {
      context.onLifecycle('shutdown', async () => {
        await activityBus.close();
        await database.end();
      });
    },
  ],
  plugins: [
    server({ bodyLimit: '11mb', staticPath: 'client/dist' }),
    ...(TUNNEL_ENABLED
      ? [
          authGate({
            gatePaths: ['/'],
            insecure: true,
          }),
        ]
      : []),
    files({
      volumes: {
        [SOURCE_IMAGE_VOLUME_KEY]: {
          auth: 'on-behalf-of-user',
          maxUploadSize: 6_000_000,
          policy: (action, _resource, user) =>
            user.isServicePrincipal === true && (action === 'upload' || action === 'download'),
        },
      },
    }),
    mastra({
      agents: { vision_data: visionDataAssistant },
      defaultAgent: 'vision_data',
      brand,
      backgroundTurns: false,
      storage: { id: 'vision-flow-mastra', ...mastraPostgres, schemaName: 'mastra_instance' },
      memory: false,
      genieIdentity: config.mastraGenieIdentity,
      genieSpaces: {
        default: {
          spaceId: config.genieSpaceId,
          hint: 'schema-defined image extractions, nested payload fields, schema context, full text, confidence, review status, and processing metadata',
        },
      },
    }),
  ],
  onPluginsReady(app) {
    app.server.extend((http) => {
      http.use((request, response, next) => {
        const publicDomain = process.env.TUNNEL_PUBLIC_DOMAIN;
        const appNavigation =
          request.method === 'GET' &&
          request.path !== '/health' &&
          !request.path.startsWith('/api/') &&
          !request.path.includes('.');
        if (appNavigation && isTunnelHost(request, publicDomain) && request.path !== '/mobile') {
          response.redirect(302, '/mobile');
          return;
        }
        next();
      });

      http.use((request, response, next) => {
        if (request.path === '/' || request.path.endsWith('.html')) {
          response.setHeader('Cache-Control', 'no-store, max-age=0');
          response.setHeader('Pragma', 'no-cache');
          response.setHeader('Expires', '0');
        }
        next();
      });

      http.get('/mobile', (_request, response) => {
        response.setHeader('Cache-Control', 'no-store, max-age=0');
        response.sendFile(resolve(import.meta.dirname, '../client/dist/index.html'));
      });

      http.get('/api/whoami', (request, response) => {
        const user =
          request.header('x-forwarded-email') ??
          request.header('x-forwarded-user') ??
          request.header('x-databricks-user') ??
          'Local Databricks profile';
        response.json({ user, executionIdentity: config.mastraGenieIdentity });
      });

      http.post('/api/activity/mobile-open', async (request, response) => {
        const parsed = MobileViewActivityRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: 'Valid mobile viewport details are required.' });
          return;
        }
        const event = await publishActivity(
          'mobile.view.opened',
          {
            summary: 'Mobile capture view opened',
            path: parsed.data.path,
          },
          activityMetadata(request, parsed.data)
        );
        response.status(202).json({ event });
      });

      http.get(ACTIVITY_IMAGE_PREVIEW_ROUTE, async (request, response) => {
        if (isTunnelHost(request, process.env.TUNNEL_PUBLIC_DOMAIN)) {
          response.status(403).json({ error: 'Image previews are available from the operations workspace.' });
          return;
        }
        const path = StoredImagePathSchema.safeParse(request.query.path);
        if (!path.success) {
          response.status(400).json({ error: 'A valid stored image path is required.' });
          return;
        }
        try {
          const download = await app.files(SOURCE_IMAGE_VOLUME_KEY).download(path.data);
          if (!download.contents) {
            response.status(404).json({ error: 'The captured image is unavailable.' });
            return;
          }
          const contents = Buffer.from(await new Response(download.contents).arrayBuffer());
          response.setHeader('Cache-Control', 'private, max-age=60');
          response.setHeader('Content-Type', path.data.endsWith('.png') ? 'image/png' : 'image/jpeg');
          response.setHeader('Content-Length', String(contents.length));
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.send(contents);
        } catch (error) {
          logger.warn('activity image preview failed', { error: toError(error), path: path.data });
          response.status(404).json({ error: 'The captured image is unavailable.' });
        }
      });

      http.get('/api/activity/events', async (request, response) => {
        response.status(200);
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Connection', 'keep-alive');
        response.flushHeaders();

        let closed = false;
        let replaying = true;
        const delivered = new Set<string>();
        const pending: TopicMessage[] = [];
        const send = (event: TopicMessage) => {
          if (closed || delivered.has(event.id)) return;
          delivered.add(event.id);
          sendActivitySse(response, event);
        };

        const unsubscribe = await activityBus.listen(ACTIVITY_TOPIC, (event) => {
          if (replaying) pending.push(event);
          else send(event);
        });
        const heartbeat = setInterval(() => {
          if (!closed) response.write(': keepalive\n\n');
        }, 15_000);
        request.on('close', () => {
          closed = true;
          clearInterval(heartbeat);
          void unsubscribe();
        });

        try {
          const retained: TopicMessage[] = [];
          let cursor: string | undefined;
          let pages = 0;
          do {
            const page = await activityBus.history(ACTIVITY_TOPIC, { after: cursor, limit: 100 });
            retained.push(...page.messages.map(({ message }) => message));
            cursor = page.nextCursor;
            pages += 1;
          } while (cursor && pages < 20 && !closed);
          for (const event of retained.slice(-100)) send(event);
          replaying = false;
          for (const event of pending) send(event);
        } catch (error) {
          logger.error('activity replay failed', { error: toError(error) });
          if (!closed) {
            response.write(
              `event: activity-error\ndata: ${JSON.stringify({ error: 'Activity history could not be loaded.' })}\n\n`
            );
          }
          replaying = false;
        }
      });

      http.get('/api/categories', async (_request, response) => {
        response.json({ categories: await listCategories() });
      });

      http.post('/api/categories/resolve', async (request, response) => {
        const parsed = CategoryResolveRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: 'Describe the image and fields to extract.' });
          return;
        }
        const operation = await createOperation(parsed.data.prompt, parsed.data.idempotencyKey);
        if (operation.created) {
          recordActivity('schema.create.requested', {
            summary: `Schema creation requested${parsed.data.displayName ? ` for ${parsed.data.displayName}` : ''}`,
            operationId: operation.id,
            captureGuide: parsed.data.captureGuide ?? 'auto',
          });
          void provisionCategoryFromPrompt(
            operation.id,
            parsed.data.prompt,
            parsed.data.displayName,
            parsed.data.captureGuide
          ).catch((error) => {
            logger.error('category provisioning failed', { error: toError(error), operationId: operation.id });
          });
        }
        response.status(operation.created ? 202 : 200).json({ operationId: operation.id });
      });

      http.patch('/api/categories/:categoryId', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = CategoryRenameRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A schema and valid name are required.' });
          return;
        }
        const operation = createOperation(
          `Rename schema ${categoryId.data}`,
          `rename:${categoryId.data}:${parsed.data.idempotencyKey}`
        );
        if (operation.created) {
          recordActivity('schema.rename.requested', {
            summary: `Schema rename requested for ${parsed.data.displayName}`,
            categoryId: categoryId.data,
            operationId: operation.id,
          });
          void renameCategoryAndRefresh(operation.id, categoryId.data, parsed.data.displayName).catch((error) => {
            logger.error('category rename failed', { error: toError(error), operationId: operation.id });
          });
        }
        response.status(operation.created ? 202 : 200).json({ operationId: operation.id });
      });

      http.patch('/api/categories/:categoryId/capture-guide', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = CaptureGuideRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A valid schema and capture guide are required.' });
          return;
        }
        if (!(await setCategoryCaptureGuide(categoryId.data, parsed.data.captureGuide))) {
          response.status(404).json({ error: 'The selected schema no longer exists.' });
          return;
        }
        const category = await getCategory(categoryId.data);
        recordActivity('schema.capture-guide.updated', {
          summary: `Capture guide changed to ${parsed.data.captureGuide}`,
          categoryId: categoryId.data,
          captureGuide: parsed.data.captureGuide,
        });
        response.json({ category });
      });

      http.delete('/api/categories/:categoryId', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = CategoryDeleteRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A schema and idempotency key are required.' });
          return;
        }
        const operation = createOperation(
          `Delete schema ${categoryId.data}`,
          `delete:${categoryId.data}:${parsed.data.idempotencyKey}`
        );
        if (operation.created) {
          recordActivity('schema.delete.requested', {
            summary: 'Schema deletion requested',
            categoryId: categoryId.data,
            operationId: operation.id,
          });
          void deleteCategoryAndRefresh(operation.id, categoryId.data).catch((error) => {
            logger.error('category deletion failed', { error: toError(error), operationId: operation.id });
          });
        }
        response.status(operation.created ? 202 : 200).json({ operationId: operation.id });
      });

      http.get('/api/operations/:operationId/events', async (request, response) => {
        const operationId = UuidSchema.safeParse(request.params.operationId);
        if (!operationId.success) {
          response.status(400).json({ error: 'A valid operation ID is required.' });
          return;
        }
        response.status(200);
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Connection', 'keep-alive');
        response.flushHeaders();

        const headerId = Number(request.header('last-event-id') ?? 0);
        const queryId = Number(request.query.after ?? 0);
        let terminal = false;
        for (const event of await listOperationEvents(operationId.data, Math.max(headerId, queryId))) {
          sendSse(response, event);
          terminal ||= event.stage === 'ready' || event.stage === 'failed';
        }
        if (terminal) {
          response.end();
          return;
        }

        const unsubscribe = subscribeOperation(operationId.data, (event) => {
          sendSse(response, event);
          if (event.stage === 'ready' || event.stage === 'failed') response.end();
        });
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000);
        request.on('close', () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
      });

      http.delete('/api/categories/:categoryId/prompts/:promptId', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const promptId = UuidSchema.safeParse(request.params.promptId);
        if (!categoryId.success || !promptId.success) {
          response.status(400).json({ error: 'Valid category and prompt IDs are required.' });
          return;
        }
        const deleted = await deletePrompt(categoryId.data, promptId.data);
        if (deleted) {
          recordActivity('schema.prompt.deleted', {
            summary: 'Schema prompt deleted',
            categoryId: categoryId.data,
            promptId: promptId.data,
          });
        }
        response.status(deleted ? 204 : 404).end();
      });

      http.post('/api/categories/:categoryId/uploads', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = ImageUploadRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A valid category and supported captured image are required.' });
          return;
        }
        try {
          const category = await getCategory(categoryId.data);
          if (!category || category.status !== 'ready') {
            response.status(409).json({ error: 'The selected category is not ready.' });
            return;
          }
          const schemaVersion = parsed.data.schemaVersion ?? category.activeSchemaVersion;
          const schema = await getSchemaVersion(category.id, schemaVersion);
          if (!schema) {
            response.status(409).json({ error: 'The selected category schema version is unavailable.' });
            return;
          }

          const gate = await quickImageGate(
            parsed.data.quickImageDataUrl ?? parsed.data.imageDataUrl,
            category.displayName,
            category.description,
            schema.contract
          );
          if (!gate.valid) {
            const result: UploadResponse = { status: 'rejected', gate };
            recordActivity(
              'image.rejected',
              {
                summary: `Image rejected for ${category.displayName}`,
                categoryId: category.id,
                categoryName: category.displayName,
                reason: gate.reason,
              },
              activityMetadata(request, parsed.data.captureContext)
            );
            response.json(result);
            return;
          }

          const image = decodeImageDataUrl(parsed.data.imageDataUrl);
          const uploadId = crypto.randomUUID();
          const storedPath = uploadPath(category.slug, schemaVersion, uploadId, image.extension);
          await app.files(SOURCE_IMAGE_VOLUME_KEY).upload(storedPath, image.contents, { overwrite: false });
          const result: UploadResponse = { status: 'queued', uploadId, storedPath, gate };
          recordActivity(
            'image.queued',
            {
              summary: `Image queued for ${category.displayName}`,
              categoryId: category.id,
              categoryName: category.displayName,
              uploadId,
              storedPath,
            },
            activityMetadata(request, parsed.data.captureContext)
          );
          response.status(202).json(result);
        } catch (error) {
          logger.error('image validation failed', { error: toError(error) });
          recordActivity(
            'image.failed',
            {
              summary: 'Image validation or queueing failed',
              categoryId: categoryId.data,
            },
            activityMetadata(request, parsed.success ? parsed.data.captureContext : undefined)
          );
          response.status(502).json({ error: 'The image could not be checked and queued. Try again.' });
        }
      });
    });
  },
});
