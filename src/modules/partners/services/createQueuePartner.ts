import type { QueuePlayer, Partner } from '../types';

export const createQueuePartner = (player: QueuePlayer): Partner => ({
  id: player.id,
  name: player.name,
  nickname: player.name,
  pin: player.verified ? 'VERIFIED' : 'QUEUE_ANONYMOUS',
  origin: 'manual',
  addedAt: Date.now(),
  gender: player.gender,
});
