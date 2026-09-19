export class InsufficientBalanceError extends Error {
  constructor(userId: string, requested: number, available: number) {
    super(`User ${userId} has ${available} but requested ${requested}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class OnCooldownError extends Error {
  constructor(public readonly remainingSeconds: number) {
    super(`On cooldown for ${remainingSeconds}s`);
    this.name = 'OnCooldownError';
  }
}
