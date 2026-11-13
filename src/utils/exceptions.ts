import type { ErrorCode } from "@/types";

export class HttpException extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestException extends HttpException {
  constructor(message = "Bad request", code: ErrorCode = "BAD_REQUEST") {
    super(message, 400, code);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = "Unauthorized", code: ErrorCode = "UNAUTHENTICATED") {
    super(message, 401, code);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = "Forbidden", code: ErrorCode = "FORBIDDEN") {
    super(message, 403, code);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = "Not found", code: ErrorCode = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class ConflictException extends HttpException {
  constructor(message = "Conflict", code: ErrorCode = "CONFLICT") {
    super(message, 409, code);
  }
}

export class PayloadTooLargeException extends HttpException {
  constructor(message = "Payload too large", code: ErrorCode = "PAYLOAD_TOO_LARGE") {
    super(message, 413, code);
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message = "Validation failed", code: ErrorCode = "VALIDATION_FAILED") {
    super(message, 422, code);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = "Service unavailable", code: ErrorCode = "RAIL_UNAVAILABLE") {
    super(message, 503, code);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(detail?: string) {
    super("Internal server error", 500, "INTERNAL");
    if (detail !== undefined) {
      this.cause = detail;
    }
  }
}
