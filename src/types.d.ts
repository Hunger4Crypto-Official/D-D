declare module 'fs-extra' {
  const fs: any;
  export = fs;
}

declare module 'better-sqlite3' {
  export default class Database {
    constructor(path: string);
    prepare(query: string): any;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    pragma(statement: string): any;
    exec(sql: string): void;
  }
}

declare module 'fast-deep-equal' {
  const equal: (a: unknown, b: unknown) => boolean;
  export default equal;
}

declare module 'algosdk' {
  export class Algodv2 {
    constructor(token: string, server: string, port: string);
    accountInformation(address: string): { do(): Promise<any> };
    getAssetByID(assetId: number): { do(): Promise<any> };
  }

  export class Indexer {
    constructor(token: string, server: string, port: string);
    lookupAssetByID(assetId: number): { do(): Promise<any> };
  }

  export function verifyBytes(message: Uint8Array, signature: Uint8Array, address: string): boolean;
}

declare module 'nanoid' {
  export function nanoid(size?: number): string;
}

declare module 'node:crypto' {
  type RandomBuffer = { toString(encoding?: string): string };
  export function randomBytes(size: number): RandomBuffer;
}

declare module 'discord.js' {
  export type Snowflake = string;

  export class Client<Ready extends boolean = boolean> {
    constructor(options?: any);
    once(event: string, listener: (...args: any[]) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    login(token: string): Promise<string>;
    channels: any;
    user: { tag: string } | null;
    [key: string]: any;
  }

  export const GatewayIntentBits: Record<string, number>;
  export const Partials: Record<string, number>;
  export const Events: Record<string, string>;
  export const ChannelType: Record<string, number>;

  export class EmbedBuilder {
    constructor(data?: any);
    setTitle(title: string): this;
    setDescription(description: string): this;
    setColor(color: number): this;
    addFields(...fields: { name: string; value: string; inline?: boolean }[]): this;
    setFooter(footer: { text: string }): this;
    [key: string]: any;
  }

  export class ButtonBuilder {
    constructor();
    setCustomId(id: string): this;
    setLabel(label: string): this;
    setEmoji(emoji: string): this;
    setStyle(style: ButtonStyle): this;
    [key: string]: any;
  }

  export class StringSelectMenuBuilder {
    constructor();
    setCustomId(id: string): this;
    setPlaceholder(text: string): this;
    addOptions(
      options:
        | { label: string; value: string; description?: string; emoji?: string }[]
        | { label: string; value: string; description?: string; emoji?: string }
    ): this;
    [key: string]: any;
  }

  export class ActionRowBuilder<T = any> {
    constructor();
    addComponents(...components: (T | T[])[]): this;
    [key: string]: any;
  }

  export enum ButtonStyle {
    Primary,
    Secondary,
    Success,
    Danger,
  }

  export class TextChannel {
    id: string;
    send(options: any): Promise<any>;
    type: number;
    [key: string]: any;
  }

  export class REST {
    constructor(options?: any);
    setToken(token: string): this;
    put(route: string, options: any): Promise<any>;
    [key: string]: any;
  }

  export const Routes: Record<string, (...args: any[]) => string>;

  export class SlashCommandBuilder {
    setName(name: string): this;
    setDescription(description: string): this;
    addUserOption(fn: (option: SlashCommandUserOption) => SlashCommandUserOption): this;
    addIntegerOption(fn: (option: SlashCommandIntegerOption) => SlashCommandIntegerOption): this;
    toJSON(): any;
  }

  export class SlashCommandUserOption {
    setName(name: string): this;
    setDescription(description: string): this;
    setRequired(required: boolean): this;
    [key: string]: any;
  }

  export class SlashCommandIntegerOption {
    setName(name: string): this;
    setDescription(description: string): this;
    setRequired(required: boolean): this;
    [key: string]: any;
  }

  export class Interaction {
    user: { id: Snowflake; tag?: string };
    reply(options: any): Promise<any>;
    isButton(): this is ButtonInteraction;
    isStringSelectMenu(): this is StringSelectMenuInteraction;
    isChatInputCommand(): boolean;
    commandName: string;
    options: any;
    [key: string]: any;
  }

  export class ButtonInteraction extends Interaction {
    customId: string;
    update(options: any): Promise<any>;
    deferReply(options?: any): Promise<any>;
    editReply(options: any): Promise<any>;
    message: any;
    channel: any;
  }

  export class StringSelectMenuInteraction extends Interaction {
    customId: string;
    values: string[];
    update(options: any): Promise<any>;
    deferReply(options?: any): Promise<any>;
    editReply(options: any): Promise<any>;
    message: any;
    channel: any;
  }

  export class Message {
    id: string;
    author: { id: Snowflake; bot: boolean };
    content: string;
    channel: any;
    reply(options: any): Promise<Message>;
    delete(): Promise<void>;
    mentions: any;
    [key: string]: any;
  }
}

declare module 'node:path' {
  const path: any;
  export = path;
}

declare module 'node:crypto' {
  const crypto: any;
  export = crypto;
}

declare module 'node:http' {
  export type IncomingMessage = any;
  export type ServerResponse = any;
  export type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;
  export function createServer(listener: RequestListener): any;
  const http: any;
  export default http;
}

declare module 'node:url' {
  export class URLSearchParams {
    constructor(init?: any);
    append(name: string, value: string): void;
    toString(): string;
    get(name: string): string | null;
    set(name: string, value: string): void;
    entries(): IterableIterator<[string, string]>;
  }
  export class URL {
    constructor(input: string, base?: string);
    toString(): string;
    searchParams: URLSearchParams;
    pathname: string;
  }
  const url: {
    URL: typeof URL;
    URLSearchParams: typeof URLSearchParams;
  };
  export default url;
}

declare module 'fs' {
  const fs: any;
  export = fs;
}

declare module 'path' {
  const path: any;
  export = path;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  pid: number;
  exit(code?: number): void;
  on(event: string, listener: (...args: any[]) => void): void;
};

type Buffer = any;
declare const Buffer: {
  from(input: any, encoding?: any): Buffer;
  concat(list: Buffer[]): Buffer;
};

declare module 'ethers' {
  export class Interface {
    constructor(abi: readonly string[]);
    parseLog(log: { topics: string[]; data: string }): {
      name?: string;
      args: Record<string, unknown> | unknown[];
    };
  }

  export class JsonRpcProvider {
    constructor(url: string);
  }

  export class BrowserProvider {
    constructor(externalProvider: unknown);
    getSigner(): Promise<Signer>;
  }

  export class Wallet {
    constructor(privateKey: string, provider?: Provider);
    connect(provider: Provider): Wallet;
  }

  export class Contract {
    constructor(address: string, abi: readonly string[], signerOrProvider: Provider | Signer);
    connect(signer: Signer): Contract;
    [key: string]: any;
  }

  export type Provider = unknown;
  export type Signer = {
    getAddress(): Promise<string>;
  } & Record<string, any>;

  export function verifyMessage(message: string, signature: string): string;
  export function parseEther(value: string): bigint;
  export function formatEther(value: bigint | number | string): string;
  export function id(value: string): string;
}
