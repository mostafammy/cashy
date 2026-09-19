import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './types.js';
import { handleCommandError } from '../errors.js';

export function createRegistry() {
  const commands = new Map<string, Command>();

  return {
    register(command: Command) {
      commands.set(command.data.name, command);
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
  };
}
