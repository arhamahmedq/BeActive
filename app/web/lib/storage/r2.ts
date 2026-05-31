import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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

export async function createSignedUploadUrl(
  userId: string,
  mimeType: string,
  fileSize: number
): Promise<SignedUploadResult> {
  const ext = MIME_TO_EXT[mimeType] ?? 'bin'
  const key = `posts/${userId}/${randomUUID()}.${ext}`
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
