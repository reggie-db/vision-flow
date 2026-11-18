import { EventEmitter } from 'node:events';
import type { OperationEvent } from '../shared/vision-contracts.ts';

interface OperationState {
  events: OperationEvent[];
  prompt: string;
}

const operations = new Map<string, OperationState>();
const idempotencyKeys = new Map<string, string>();
const events = new EventEmitter();
events.setMaxListeners(100);

export function createOperation(prompt: string, idempotencyKey: string): { id: string; created: boolean } {
  const existing = idempotencyKeys.get(idempotencyKey);
  if (existing) return { id: existing, created: false };
  const id = crypto.randomUUID();
  operations.set(id, { events: [], prompt });
  idempotencyKeys.set(idempotencyKey, id);
  return { id, created: true };
}

export function appendOperationEvent(
  operationId: string,
  event: Omit<OperationEvent, 'sequence' | 'createdAt'>,
): OperationEvent {
  const operation = operations.get(operationId);
  if (!operation) throw new Error(`Unknown operation ${operationId}.`);
  const stored: OperationEvent = {
    ...event,
    sequence: operation.events.length + 1,
    createdAt: new Date().toISOString(),
  };
  operation.events.push(stored);
  events.emit(operationId, stored);
  return stored;
}

export function listOperationEvents(operationId: string, after = 0): OperationEvent[] {
  return (operations.get(operationId)?.events ?? []).filter((event) => event.sequence > after);
}

export function subscribeOperation(operationId: string, listener: (event: OperationEvent) => void): () => void {
  events.on(operationId, listener);
  return () => events.off(operationId, listener);
}

export function completeOperation(_operationId: string, _categoryId: string): void {}

export function failOperation(_operationId: string, _error: string): void {}
