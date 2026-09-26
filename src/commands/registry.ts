import type { ChatInputCommandInteraction, Message } from 'discord.js';
import type { Command, CommandInvocation } from './types.js';
import { handleCommandError } from '../errors.js';
import { MessageCommandAdapter } from '../lib/messageCommandAdapter.js';

export function createRegistry() {
  const commands = new Map<string, Command>();
  const aliases = new Map<string, Command>();

  return {
    register(command: Command) {
      commands.set(command.data.name, command);
      for (const alias of command.aliases ?? []) {
        aliases.set(alias.toLowerCase(), command);
      }
    },
    get(name: string) {
      return commands.get(name);
    },
    async handleInteraction(interaction: ChatInputCommandInteraction) {
      const command = commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        await handleCommandError(interaction, error);
      }
    },
    /** Dispatches a bare-word text trigger (e.g. a message that's just "b") to its aliased command. */
    async handleTextTrigger(message: Message) {
      const command = aliases.get(message.content.trim().toLowerCase());
      if (!command) return;

      const invocation = new MessageCommandAdapter(message);
      try {
        // Safe: only commands that declare `aliases` are ever routed here,
        // and those are authored (see balance.ts/daily.ts) to accept the
        // wider CommandInvocation union, not just ChatInputCommandInteraction.
        await (command.execute as unknown as (i: CommandInvocation) => Promise<void>)(invocation);
      } catch (error) {
        await handleCommandError(invocation, error);
      }
    },
  };
}
