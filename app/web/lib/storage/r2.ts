// Cloudflare R2 storage abstraction
// Uses S3-compatible API via AWS SDK
// Actual implementation added in Slice 2 (Upload & Post)

export interface SignedUploadResult {
  uploadUrl: string
  key: string
  publicUrl: string
}

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicUrl: string
}

function getR2Config(): R2Config {
  return {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucketName: process.env.R2_BUCKET_NAME!,
    publicUrl: process.env.R2_PUBLIC_URL!,
  }
}

// Stub: returns placeholder — real implementation in Slice 2
export async function createSignedUploadUrl(
  _mimeType: string,
  _fileSize: number
): Promise<SignedUploadResult> {
  const config = getR2Config()
  void config // validates env vars are present at runtime
  throw new Error('R2 upload not yet implemented — coming in Slice 2')
}

// Stub: real implementation in Slice 2
export async function deleteObject(_key: string): Promise<void> {
  throw new Error('R2 delete not yet implemented — coming in Slice 2')
}
