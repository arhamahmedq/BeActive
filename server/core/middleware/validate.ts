import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ValidationError, toErrorResponse } from '../errors/AppError'

export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<T | NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    const error = new ValidationError([{ message: 'Invalid JSON body' }])
    return NextResponse.json(toErrorResponse(error), { status: 400 })
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
    const error = new ValidationError(details)
    return NextResponse.json(toErrorResponse(error), { status: 400 })
  }

  return result.data
}

export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): T | NextResponse {
  const params = Object.fromEntries(searchParams.entries())
  const result = schema.safeParse(params)
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
    const error = new ValidationError(details)
    return NextResponse.json(toErrorResponse(error), { status: 400 })
  }
  return result.data
}
