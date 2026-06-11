import { randomUUID } from 'crypto'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface SignedUploadResult {
  uploadUrl: string
  key: string
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const PRESIGNED_URL_TTL_SECONDS = 300 // 5 minutes

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

// Public CDN URL for a stored object. Single place that knows R2_PUBLIC_URL so
// callers (posts, avatars) never construct URLs from raw env.
export function buildPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL
  if (!base) throw new Error('R2_PUBLIC_URL env var is missing')
  return `${base.replace(/\/$/, '')}/${key}`
}

export async function createSignedUploadUrl(
  userId: string,
  mimeType: string,
  fileSize: number,
  prefix: 'posts' | 'avatars' = 'posts'
): Promise<SignedUploadResult> {
  const ext = MIME_TO_EXT[mimeType] ?? 'bin'
  const key = `${prefix}/${userId}/${randomUUID()}.${ext}`
  const bucket = process.env.R2_BUCKET_NAME!

  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: mimeType,
    ContentLength: fileSize,
  })

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGNED_URL_TTL_SECONDS,
  })

  return { uploadUrl, key }
}

export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client()
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    })
  )
}

// ---------------------------------------------------------------------------
// Story Sharing V3 — server-side write/read of generated assets.
// ---------------------------------------------------------------------------

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl: string
): Promise<void> {
  const client = getR2Client()
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  )
}

export async function objectExists(key: string): Promise<boolean> {
  const client = getR2Client()
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      })
    )
    return true
  } catch (err) {
    if (err instanceof NotFound) return false
    // R2 sometimes returns a generic 404 that doesn't deserialize as NotFound.
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return false
    }
    throw err
  }
}

export async function getObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const client = getR2Client()
  const res = await client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    })
  )
  const buffer = Buffer.from(await res.Body!.transformToByteArray())
  return { buffer, contentType: res.ContentType ?? 'application/octet-stream' }
}
