export class ApplicationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class GameNotFoundError extends ApplicationError {}
export class UnauthorizedSeatError extends ApplicationError {}
