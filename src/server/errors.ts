export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_INVITED'
  | 'DEACTIVATED'
  | 'LOCKED'
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'UNAVAILABLE'

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  NOT_INVITED: 403,
  DEACTIVATED: 403,
  LOCKED: 423,
  METHOD_NOT_ALLOWED: 403,
  INVALID_CREDENTIALS: 401,
  INVALID_TOKEN: 400,
  UNAVAILABLE: 503,
}

/** Error terstruktur dari service layer. `message` aman ditampilkan ke user. */
export class ServiceError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: Record<string, unknown>) {
    super(message)
    this.name = 'ServiceError'
  }
  get status() {
    return HTTP_STATUS[this.code]
  }
}

export const isServiceError = (e: unknown): e is ServiceError => e instanceof ServiceError
