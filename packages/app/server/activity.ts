import { PostgresTopicBus, type TopicMessage } from '@dbx-tools/postgres';
import { log } from '@dbx-tools/shared-core';
import { database } from './database.ts';

export const ACTIVITY_TOPIC = 'activity';

const logger = log.logger('vision-flow-activity');

export const activityBus = new PostgresTopicBus(database, {
  channel: ['vision-flow', 'activity'],
  persist: true,
  onError: (cause) => logger.error('activity bus failed', { cause }),
});

export async function publishActivity(
  type: string,
  body: { summary: string; [key: string]: string | number | boolean | null },
  metadata: Record<string, string | number | boolean | null> = {}
): Promise<TopicMessage> {
  return activityBus.broadcast(ACTIVITY_TOPIC, { type, body, metadata });
}
