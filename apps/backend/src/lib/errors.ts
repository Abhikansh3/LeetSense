/** An error with an attached HTTP status code, thrown by services/controllers. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const BadRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const Unauthorized = (msg = "Unauthorized") => new HttpError(401, msg);
export const Forbidden = (msg = "Forbidden") => new HttpError(403, msg);
export const NotFound = (msg = "Not found") => new HttpError(404, msg);
export const Conflict = (msg: string) => new HttpError(409, msg);
