import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

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

  // Replying can itself fail — e.g. Discord 10062 "Unknown interaction" when
  // the 3s ack window was missed, or a second failure on an already-consumed
  // token. That must not escape as a second, uncaught error.
  try {
    if (interaction.deferred && !interaction.replied) {
      // A deferred-but-unresolved interaction has a "thinking..." placeholder
      // that must be resolved via editReply — followUp would instead leave
      // that placeholder hanging forever and send a confusing second message.
      await interaction.editReply({ content });
    } else if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (replyError) {
    console.error('Failed to deliver command error message to the user:', replyError);
  }
}
