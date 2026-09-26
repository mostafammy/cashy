import type { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import type { MessageCommandAdapter } from '../lib/messageCommandAdapter.js';

/**
 * Whatever a command's execute() actually calls, satisfied by either a real
 * slash-command interaction or a MessageCommandAdapter wrapping a text
 * trigger. Widening a command's execute() to accept this union (instead of
 * ChatInputCommandInteraction alone) is what makes it text-trigger-eligible.
 */
export type CommandInvocation = ChatInputCommandInteraction | MessageCommandAdapter;

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Bare-word text triggers (case-insensitive, exact message match) that also run this command. */
  aliases?: string[];
}
