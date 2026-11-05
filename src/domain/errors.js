// Domain errors. The HTTP layer maps these to status codes; the domain knows nothing about HTTP.

export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidFenError extends DomainError {}
export class InvalidMoveFormatError extends DomainError {}
export class IllegalMoveError extends DomainError {}
export class GameOverError extends DomainError {}
export class NotYourTurnError extends DomainError {}
