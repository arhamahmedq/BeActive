export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown[]
  ) {
    super(message)
    this.name = 'AppError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown[]) {
    super('VALIDATION_ERROR', 400, 'Validation failed', details)
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 401, 'Authentication required')
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super('EMAIL_NOT_VERIFIED', 401, 'Please verify your email before signing in.')
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 403, 'Access denied')
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', 404, `${resource} not found`)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', 409, message)
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMITED', 429, 'Too many requests')
  }
}

export class InternalError extends AppError {
  constructor() {
    super('INTERNAL_ERROR', 500, 'An unexpected error occurred')
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toErrorResponse(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  }
}
