import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { createRegistry } from '../../src/commands/registry.js';
import { InsufficientBalanceError, OnCooldownError } from '../../src/errors.js';
import type { Command } from '../../src/commands/types.js';
import type { ChatInputCommandInteraction } from 'discord.js';

function mockInteraction(commandName: string) {
  return {
    commandName,
    replied: false,
    deferred: false,
    reply: vi.fn(),
  } as unknown as ChatInputCommandInteraction;
}

describe('command registry', () => {
  it('routes an interaction to the matching command execute()', async () => {
    const registry = createRegistry();
    const execute = vi.fn().mockResolvedValue(undefined);
    registry.register({ data: { name: 'ping', toJSON: () => ({}) }, execute } as Command);

    const interaction = mockInteraction('ping');
    await registry.handleInteraction(interaction);

    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('replies with an ephemeral message when the command throws InsufficientBalanceError', async () => {
    const registry = createRegistry();
    registry.register({
      data: { name: 'pay', toJSON: () => ({}) },
      execute: async () => {
        throw new InsufficientBalanceError('u1', 100, 10);
      },
    } as Command);

    const interaction = mockInteraction('pay');
    await registry.handleInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral, content: expect.stringContaining("don't have enough") }),
    );
  });

  it('replies with remaining time when the command throws OnCooldownError', async () => {
    const registry = createRegistry();
    registry.register({
      data: { name: 'daily', toJSON: () => ({}) },
      execute: async () => {
        throw new OnCooldownError(45);
      },
    } as Command);

    const interaction = mockInteraction('daily');
    await registry.handleInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral, content: expect.stringContaining('45') }),
    );
  });

  it('does nothing when no command matches the interaction name', async () => {
    const registry = createRegistry();
    const interaction = mockInteraction('unknown');
    await expect(registry.handleInteraction(interaction)).resolves.toBeUndefined();
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
