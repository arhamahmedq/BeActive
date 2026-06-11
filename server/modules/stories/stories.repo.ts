// Stories repository — Prisma queries only, no business logic.
// Story Sharing V3 — persistence for the immutable payload snapshot + cached asset.

import { Prisma, type StoryStatus } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { StoryPayload, StoryRow } from './stories.types'

export async function getStoryByPostId(postId: string): Promise<StoryRow | null> {
  const row = await prisma.story.findUnique({
    where: { postId },
    select: {
      id: true,
      postId: true,
      userId: true,
      payload: true,
      shareVersion: true,
      status: true,
      assetKey: true,
      assetUrl: true,
    },
  })

  if (!row) return null

  return {
    ...row,
    payload: row.payload as unknown as StoryPayload,
  }
}

export async function upsertPendingStory(
  postId: string,
  userId: string,
  payload: StoryPayload,
  shareVersion: number
): Promise<{ id: string; shareVersion: number }> {
  return prisma.story.upsert({
    where: { postId },
    create: {
      postId,
      userId,
      payload: payload as unknown as Prisma.InputJsonValue,
      shareVersion,
      status: 'PENDING_RENDER',
    },
    update: {
      payload: payload as unknown as Prisma.InputJsonValue,
      shareVersion,
      status: 'PENDING_RENDER',
      renderError: null,
    },
    select: { id: true, shareVersion: true },
  })
}

export async function markStoryReady(
  id: string,
  data: { assetKey: string; assetUrl: string; renderMs: number }
): Promise<void> {
  await prisma.story.update({
    where: { id },
    data: {
      status: 'READY' as StoryStatus,
      assetKey: data.assetKey,
      assetUrl: data.assetUrl,
      renderMs: data.renderMs,
      renderError: null,
    },
  })
}

export async function markStoryFailed(id: string, error: string): Promise<void> {
  await prisma.story.update({
    where: { id },
    data: {
      status: 'FAILED' as StoryStatus,
      renderError: error.slice(0, 1000),
    },
  })
}
