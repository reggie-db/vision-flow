import { z } from 'zod';

export const MAX_IMAGE_DATA_URL_LENGTH = 8_000_000;
export const ACTIVITY_IMAGE_PREVIEW_ROUTE = '/api/activity/image-preview';

export const CaptureGuideSchema = z.enum(['vertical', 'horizontal', 'none']);

export const ScalarFieldTypeSchema = z.enum(['string', 'integer', 'number', 'currency', 'boolean', 'date']);

export const ScalarFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  label: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: ScalarFieldTypeSchema,
  required: z.boolean(),
});

export const ArrayFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  label: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: z.literal('array'),
  required: z.boolean(),
  itemFields: z.array(ScalarFieldSchema).min(1).max(24),
});

export const ContractFieldSchema = z.union([ScalarFieldSchema, ArrayFieldSchema]);

export const CategoryContractSchema = z.object({
  documentIntent: z.string().min(1).max(500),
  extractionInstructions: z.string().min(1).max(2_000),
  fields: z.array(ContractFieldSchema).min(1).max(40),
});

export const CategoryStatusSchema = z.enum([
  'resolving',
  'table_created',
  'catalog_visible',
  'genie_configured',
  'dashboard_configured',
  'ready',
  'failed',
]);

export const CategorySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(100),
  slug: z.string(),
  schemaId: z.string().regex(/^[a-f0-9]{64}$/),
  description: z.string(),
  status: CategoryStatusSchema,
  activeSchemaVersion: z.number().int().positive(),
  captureGuide: CaptureGuideSchema,
  contract: CategoryContractSchema,
  tableName: z.string(),
  ucTable: z.string(),
  volumeDirectory: z.string(),
  dashboardOpenUrl: z.string().url(),
  dashboardEmbedUrl: z.string().url(),
  prompts: z.array(
    z.object({
      id: z.string().uuid(),
      prompt: z.string(),
      createdAt: z.string(),
      canonical: z.boolean(),
    })
  ),
});

export const CategoryResolveRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(3).max(2_000),
  captureGuide: CaptureGuideSchema.optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export const CaptureGuideRequestSchema = z.object({
  captureGuide: CaptureGuideSchema,
});

export const CategoryRenameRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().min(8).max(200),
});

export const CategoryDeleteRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
});

export const CategoryResolveResponseSchema = z.object({
  operationId: z.string().uuid(),
});

export const OperationEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  stage: z.enum([
    'resolving',
    'matching_schema',
    'preparing_storage',
    'updating_genie',
    'generating_dashboard',
    'updating_dashboard',
    'deleting_schema',
    'ready',
    'failed',
  ]),
  message: z.string(),
  categoryId: z.string().uuid().optional(),
  categorySlug: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
});

export const DeviceActivityContextSchema = z.object({
  captureSessionId: z.string().uuid(),
  browser: z.string().min(1).max(100),
  platform: z.string().min(1).max(100),
  mobile: z.boolean(),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  devicePixelRatio: z.number().positive().max(20),
  displayMode: z.enum(['browser', 'standalone', 'fullscreen', 'minimal-ui']),
});

export const CaptureActivityContextSchema = DeviceActivityContextSchema.extend({
  source: z.enum(['camera', 'upload']),
});

export const ImageUploadRequestSchema = z.object({
  imageDataUrl: z
    .string()
    .max(MAX_IMAGE_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:jpeg|png);base64,/),
  quickImageDataUrl: z
    .string()
    .max(1_500_000)
    .regex(/^data:image\/(?:jpeg|png);base64,/)
    .optional(),
  schemaVersion: z.number().int().positive().optional(),
  captureContext: CaptureActivityContextSchema.optional(),
});

export const ImageGateResultSchema = z.object({
  valid: z.boolean(),
  missingFields: z.array(z.string()),
  reason: z.string().max(500),
});

export const UploadResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('queued'),
    uploadId: z.string().uuid(),
    storedPath: z.string(),
    gate: ImageGateResultSchema,
  }),
  z.object({
    status: z.literal('rejected'),
    gate: ImageGateResultSchema,
  }),
]);

export const ActivityMessageSchema = z.object({
  id: z.string(),
  topic: z.literal('activity'),
  type: z.string().min(1),
  metadata: z.record(z.string(), z.json()),
  body: z
    .object({
      summary: z.string().min(1),
    })
    .catchall(z.json()),
  publishedAt: z.string(),
});

export const MobileViewActivityRequestSchema = DeviceActivityContextSchema.extend({
  path: z.string().min(1).max(500),
});

export type ArrayField = z.infer<typeof ArrayFieldSchema>;
export type ActivityMessage = z.infer<typeof ActivityMessageSchema>;
export type CaptureGuide = z.infer<typeof CaptureGuideSchema>;
export type CaptureActivityContext = z.infer<typeof CaptureActivityContextSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CategoryContract = z.infer<typeof CategoryContractSchema>;
export type ContractField = z.infer<typeof ContractFieldSchema>;
export type DeviceActivityContext = z.infer<typeof DeviceActivityContextSchema>;
export type ImageGateResult = z.infer<typeof ImageGateResultSchema>;
export type OperationEvent = z.infer<typeof OperationEventSchema>;
export type ScalarField = z.infer<typeof ScalarFieldSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
