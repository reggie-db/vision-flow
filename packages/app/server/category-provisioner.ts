import { withAdvisoryTransactionLock } from '@dbx-tools/postgres';
import type { Category, CategoryContract } from '../shared/vision-contracts.ts';
import { config } from './config.ts';
import { ensureCategoryDashboard, refreshVisionDashboard } from './dashboard-manager.ts';
import { database } from './database.ts';
import { ensureVisionGenieSpace } from './genie-manager.ts';
import { decideCategory, embedText } from './model-gateway.ts';
import { appendOperationEvent, completeOperation, failOperation } from './operations.ts';
import {
  addPrompt,
  findCandidateCategories,
  findCategoryByFingerprint,
  findCategoryByPrompt,
  getCategory,
  insertCategory,
  listCategories,
  deleteCategory as deleteCategoryRecord,
  renameCategory as renameCategoryRecord,
  setCategoryStatus,
} from './registry.ts';
import {
  DEFAULT_CATEGORY_CONTRACT,
  DEFAULT_CATEGORY_SLUG,
  contractFingerprint,
  contractSearchText,
  extractionJsonSchema,
  humanReadableDisplayName,
  normalizeSlug,
} from './schema-contract.ts';

interface ProvisionSpec {
  displayName: string;
  slug: string;
  description: string;
  contract: CategoryContract;
  prompt: string;
  embedding?: number[];
}

function emit(operationId: string | undefined, event: Parameters<typeof appendOperationEvent>[1]): void {
  if (operationId) appendOperationEvent(operationId, event);
}

async function finishProvisioning(categoryId: string, slug: string, operationId?: string): Promise<Category> {
  try {
    emit(operationId, {
      stage: 'preparing_storage',
      message: 'Registering the immutable schema for the shared image store.',
      categoryId,
      categorySlug: slug,
    });
    await setCategoryStatus(categoryId, 'table_created');

    emit(operationId, {
      stage: 'updating_genie',
      message: 'Refreshing the additive extraction data and schema context in Genie.',
      categoryId,
      categorySlug: slug,
    });
    await ensureVisionGenieSpace();
    await setCategoryStatus(categoryId, 'genie_configured');

    emit(operationId, {
      stage: 'generating_dashboard',
      message: 'Generating an analytics page for this schema.',
      categoryId,
      categorySlug: slug,
    });
    await ensureCategoryDashboard(categoryId);
    await setCategoryStatus(categoryId, 'dashboard_configured');
    await setCategoryStatus(categoryId, 'ready');
    const category = await getCategory(categoryId);
    if (!category) throw new Error(`Created category ${categoryId} could not be loaded.`);
    emit(operationId, {
      stage: 'ready',
      message: `${category.displayName} is ready to scan and query.`,
      categoryId,
      categorySlug: slug,
    });
    if (operationId) completeOperation(operationId, categoryId);
    return category;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setCategoryStatus(categoryId, 'failed', message);
    throw error;
  }
}

async function provisionSpec(spec: ProvisionSpec, operationId?: string): Promise<Category> {
  const fingerprint = contractFingerprint(spec.contract);
  const existing = await findCategoryByFingerprint(fingerprint);
  if (existing) {
    await addPrompt(existing.id, spec.prompt);
    if (existing.status !== 'ready') return finishProvisioning(existing.id, existing.slug, operationId);
    emit(operationId, {
      stage: 'updating_genie',
      message: 'Refreshing the additive extraction data and schema context in Genie.',
      categoryId: existing.id,
      categorySlug: existing.slug,
    });
    await ensureVisionGenieSpace();
    emit(operationId, {
      stage: 'updating_dashboard',
      message: 'Refreshing the shared Vision Flow dashboard.',
      categoryId: existing.id,
      categorySlug: existing.slug,
    });
    await ensureCategoryDashboard(existing.id);
    emit(operationId, {
      stage: 'ready',
      message: `Reused ${existing.displayName}.`,
      categoryId: existing.id,
      categorySlug: existing.slug,
    });
    if (operationId) completeOperation(operationId, existing.id);
    return existing;
  }

  const slug = normalizeSlug(spec.slug);
  const description = spec.description.trim();
  const categoryId = crypto.randomUUID();
  const searchText = contractSearchText(slug, description, spec.contract);
  const embedding = spec.embedding ?? (await embedText(searchText));
  const extractionSchema = extractionJsonSchema(spec.contract);

  let created = false;
  await withAdvisoryTransactionLock(database, ['vision-flow', 'category-fingerprint', fingerprint], async (client) => {
    const metaSchema = config.metaSchema.replaceAll('"', '""');
    const duplicate = await client.query<{ category_id: string }>(
      `SELECT category_id FROM "${metaSchema}"."schema_versions" WHERE fingerprint = $1`,
      [fingerprint],
    );
    if (duplicate.rows[0]) return;
    await insertCategory(client, {
      id: categoryId,
      displayName: humanReadableDisplayName(spec.displayName),
      slug,
      description,
      fingerprint,
      contract: spec.contract,
      extractionSchema,
      searchText,
      embedding,
      prompt: spec.prompt,
    });
    created = true;
  });

  if (!created) {
    const duplicate = await findCategoryByFingerprint(fingerprint);
    if (!duplicate) throw new Error('The matching category was created concurrently but could not be loaded.');
    await addPrompt(duplicate.id, spec.prompt);
    if (duplicate.status !== 'ready') return finishProvisioning(duplicate.id, duplicate.slug, operationId);
    emit(operationId, {
      stage: 'ready',
      message: `Reused ${duplicate.displayName}.`,
      categoryId: duplicate.id,
      categorySlug: duplicate.slug,
    });
    if (operationId) completeOperation(operationId, duplicate.id);
    return duplicate;
  }

  return finishProvisioning(categoryId, slug, operationId);
}

export async function provisionCategoryFromPrompt(
  operationId: string,
  prompt: string,
  requestedDisplayName?: string,
): Promise<void> {
  try {
    emit(operationId, { stage: 'resolving', message: 'Resolving the requested image type and required fields.' });
    const exact = await findCategoryByPrompt(prompt);
    if (exact?.status === 'ready') {
      emit(operationId, {
        stage: 'updating_dashboard',
        message: 'Refreshing the shared Vision Flow dashboard.',
        categoryId: exact.id,
        categorySlug: exact.slug,
      });
      await ensureCategoryDashboard(exact.id);
      emit(operationId, {
        stage: 'ready',
        message: `Reused ${exact.displayName}.`,
        categoryId: exact.id,
        categorySlug: exact.slug,
      });
      completeOperation(operationId, exact.id);
      return;
    }
    if (exact) {
      await provisionSpec(
        {
          displayName: exact.displayName,
          slug: exact.slug,
          description: exact.description,
          contract: exact.contract,
          prompt,
        },
        operationId,
      );
      return;
    }

    let candidates = await findCandidateCategories(prompt);
    let promptEmbedding: number[] | undefined;
    if (candidates.length === 0) {
      promptEmbedding = await embedText(prompt);
      candidates = await findCandidateCategories(prompt, promptEmbedding);
    }
    emit(operationId, {
      stage: 'matching_schema',
      message:
        candidates.length > 0
          ? 'Comparing the proposed schema with full-text and semantic matches.'
          : 'No existing schema matched; drafting a new immutable schema.',
    });
    const decision = await decideCategory(prompt, candidates);
    if (decision.action === 'clarify') throw new Error(decision.clarification ?? 'The requested category needs more detail.');
    if (!decision.contract) throw new Error('The model did not return a complete extraction contract.');

    const proposedFingerprint = contractFingerprint(decision.contract);
    if (decision.action === 'reuse' && decision.matchedCategoryId) {
      const matched = candidates.find((candidate) => candidate.id === decision.matchedCategoryId);
      if (matched && contractFingerprint(matched.contract) === proposedFingerprint) {
        await provisionSpec(
          {
            displayName: matched.displayName,
            slug: matched.slug,
            description: matched.description,
            contract: matched.contract,
            prompt,
          },
          operationId,
        );
        return;
      }
    }

    await provisionSpec(
      {
        displayName: requestedDisplayName ?? decision.displayName ?? decision.description ?? 'Extraction schema',
        slug: decision.categorySlug ?? `image_${proposedFingerprint.slice(0, 8)}`,
        description: decision.description ?? decision.contract.documentIntent,
        contract: decision.contract,
        prompt,
        embedding: promptEmbedding,
      },
      operationId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failOperation(operationId, message);
    emit(operationId, { stage: 'failed', message, error: message });
  }
}

export async function ensureDefaultCategory(): Promise<Category> {
  const categories = await listCategories();
  const existing = categories.find((category) => category.slug === DEFAULT_CATEGORY_SLUG);
  if (existing?.status === 'ready') {
    await ensureCategoryDashboard(existing.id);
    return existing;
  }
  return provisionSpec({
    displayName: 'Machine sales',
    slug: DEFAULT_CATEGORY_SLUG,
    description: 'Machine-generated sales image with jurisdiction, quantity sold, price, date, and optional location details.',
    contract: DEFAULT_CATEGORY_CONTRACT,
    prompt: 'Machine sales image with jurisdiction, quantity sold, price, date, and address when present.',
  });
}

export async function renameCategoryAndRefresh(
  operationId: string,
  categoryId: string,
  displayName: string,
): Promise<void> {
  try {
    const normalizedDisplayName = humanReadableDisplayName(displayName);
    const category = await getCategory(categoryId);
    if (!category) throw new Error('The selected schema no longer exists.');
    emit(operationId, {
      stage: 'generating_dashboard',
      message: 'Updating the schema name and dashboard page.',
      categoryId,
      categorySlug: category.slug,
    });
    if (!(await renameCategoryRecord(categoryId, normalizedDisplayName))) throw new Error('The selected schema no longer exists.');
    await ensureCategoryDashboard(categoryId);
    emit(operationId, {
      stage: 'ready',
      message: `${normalizedDisplayName} is ready.`,
      categoryId,
      categorySlug: category.slug,
    });
    completeOperation(operationId, categoryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failOperation(operationId, message);
    emit(operationId, { stage: 'failed', message, error: message });
  }
}

export async function deleteCategoryAndRefresh(operationId: string, categoryId: string): Promise<void> {
  try {
    const categories = await listCategories();
    const category = categories.find((candidate) => candidate.id === categoryId);
    if (!category) throw new Error('The selected schema no longer exists.');
    if (categories.length <= 1) throw new Error('At least one schema must remain available.');
    emit(operationId, {
      stage: 'deleting_schema',
      message: `Deleting ${category.displayName}.`,
      categoryId,
      categorySlug: category.slug,
    });
    if (!(await deleteCategoryRecord(categoryId))) throw new Error('The selected schema no longer exists.');
    emit(operationId, {
      stage: 'updating_genie',
      message: 'Refreshing extraction schema context in Genie.',
      categoryId,
      categorySlug: category.slug,
    });
    await ensureVisionGenieSpace();
    emit(operationId, {
      stage: 'updating_dashboard',
      message: 'Removing the schema page from the shared dashboard.',
      categoryId,
      categorySlug: category.slug,
    });
    await refreshVisionDashboard();
    emit(operationId, {
      stage: 'ready',
      message: `${category.displayName} was deleted.`,
      categoryId,
      categorySlug: category.slug,
    });
    completeOperation(operationId, categoryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failOperation(operationId, message);
    emit(operationId, { stage: 'failed', message, error: message });
  }
}
