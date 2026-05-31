import { describe, it, expect } from 'vitest'
import { signUploadSchema, createPostSchema } from '../../server/modules/posts/posts.schema'

const TEN_MB = 10 * 1024 * 1024

// ---------------------------------------------------------------------------
// signUploadSchema
// ---------------------------------------------------------------------------
describe('signUploadSchema', () => {
  const valid = { mimeType: 'image/jpeg', fileSize: 1_000_000 }

  it('accepts valid jpeg', () => {
    expect(signUploadSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts image/png', () => {
    expect(signUploadSchema.safeParse({ ...valid, mimeType: 'image/png' }).success).toBe(true)
  })

  it('accepts image/webp', () => {
    expect(signUploadSchema.safeParse({ ...valid, mimeType: 'image/webp' }).success).toBe(true)
  })

  it('rejects image/gif', () => {
    const result = signUploadSchema.safeParse({ ...valid, mimeType: 'image/gif' })
    expect(result.success).toBe(false)
  })

  it('rejects empty mimeType', () => {
    expect(signUploadSchema.safeParse({ ...valid, mimeType: '' }).success).toBe(false)
  })

  it('rejects application/octet-stream', () => {
    expect(signUploadSchema.safeParse({ ...valid, mimeType: 'application/octet-stream' }).success).toBe(false)
  })

  it('accepts exactly 10 MB', () => {
    expect(signUploadSchema.safeParse({ ...valid, fileSize: TEN_MB }).success).toBe(true)
  })

  it('rejects files over 10 MB', () => {
    const result = signUploadSchema.safeParse({ ...valid, fileSize: TEN_MB + 1 })
    expect(result.success).toBe(false)
  })

  it('rejects fileSize of 0', () => {
    expect(signUploadSchema.safeParse({ ...valid, fileSize: 0 }).success).toBe(false)
  })

  it('rejects negative fileSize', () => {
    expect(signUploadSchema.safeParse({ ...valid, fileSize: -1 }).success).toBe(false)
  })

  it('rejects non-integer fileSize', () => {
    expect(signUploadSchema.safeParse({ ...valid, fileSize: 1.5 }).success).toBe(false)
  })

  it('rejects missing mimeType', () => {
    expect(signUploadSchema.safeParse({ fileSize: 1000 }).success).toBe(false)
  })

  it('rejects missing fileSize', () => {
    expect(signUploadSchema.safeParse({ mimeType: 'image/jpeg' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createPostSchema
// ---------------------------------------------------------------------------
describe('createPostSchema', () => {
  const validKey = 'posts/user-123/abc.jpg'
  const valid = { imageKey: validKey }

  it('accepts valid imageKey without caption', () => {
    expect(createPostSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts imageKey with valid caption', () => {
    expect(createPostSchema.safeParse({ ...valid, caption: 'Morning run!' }).success).toBe(true)
  })

  it('accepts empty-string caption', () => {
    expect(createPostSchema.safeParse({ ...valid, caption: '' }).success).toBe(true)
  })

  it('rejects caption over 500 chars', () => {
    const result = createPostSchema.safeParse({ ...valid, caption: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })

  it('accepts caption of exactly 500 chars', () => {
    expect(createPostSchema.safeParse({ ...valid, caption: 'a'.repeat(500) }).success).toBe(true)
  })

  it('rejects empty imageKey', () => {
    expect(createPostSchema.safeParse({ imageKey: '' }).success).toBe(false)
  })

  it('rejects missing imageKey', () => {
    expect(createPostSchema.safeParse({}).success).toBe(false)
  })

  it('rejects imageKey over 500 chars', () => {
    expect(createPostSchema.safeParse({ imageKey: 'p/' + 'a'.repeat(499) }).success).toBe(false)
  })
})
