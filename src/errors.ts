import type { ChatInputCommandInteraction } from 'discord.js';

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

export async function handleCommandError(interaction: ChatInputCommandInteraction, error: unknown): Promise<void> {
  let content = 'Something went wrong running that command.';

  if (error instanceof InsufficientBalanceError) {
    content = "You don't have enough balance for that.";
  } else if (error instanceof OnCooldownError) {
    content = `That's on cooldown. Try again in ${error.remainingSeconds}s.`;
  } else {
    console.error('Unhandled command error:', error);
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}
