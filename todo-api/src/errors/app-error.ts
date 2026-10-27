export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code = "INTERNAL_ERROR") {
    super(message);

    this.statusCode = statusCode;
    this.code = code;

    this.name = "AppError";
  }
}
