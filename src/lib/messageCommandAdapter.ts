import type { Message, User } from 'discord.js';

/**
 * Adapter (GoF pattern): makes a plain-text trigger (e.g. bare "b" or "d")
 * look enough like a ChatInputCommandInteraction that existing command
 * `execute()` bodies run unmodified, whether invoked via slash command or
 * text trigger. Only implements the subset of the interaction API that
 * alias-eligible commands actually use — see CommandInvocation in types.ts.
 */
export class MessageCommandAdapter {
  readonly user: User;
  readonly guildId: string | null;
  deferred = false;
  replied = false;

  private readonly message: Message;
  private sentMessage: Message | undefined;

  constructor(message: Message) {
    this.message = message;
    this.user = message.author;
    this.guildId = message.guildId;
  }

  readonly options = {
    // Text triggers carry no slash-command options; the closest equivalent
    // is "the user this message mentions", e.g. a future "b @someone".
    getUser: (_name: string): User | null => this.message.mentions.users.first() ?? null,
  };

  async reply(options: { content: string; flags?: unknown }): Promise<void> {
    this.sentMessage = await this.message.reply({ content: options.content });
    this.replied = true;
  }

  async deferReply(): Promise<void> {
    this.sentMessage = await this.message.reply({ content: '⏳ Working on it...' });
    this.deferred = true;
  }

  async editReply(options: { content: string; flags?: unknown }): Promise<void> {
    if (this.sentMessage) {
      await this.sentMessage.edit({ content: options.content });
    } else {
      this.sentMessage = await this.message.reply({ content: options.content });
    }
    this.replied = true;
  }

  async followUp(options: { content: string; flags?: unknown }): Promise<void> {
    await this.message.reply({ content: options.content });
  }
}
