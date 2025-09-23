import db from '../persistence/db.js';
import { logger } from '../utils/logger.js';

export interface AlgorandConfig {
  apiUrl: string;
  apiKey: string;
  network: 'mainnet' | 'testnet';
  appId: number;
  assetId: number;
}

export interface AlgorandNFT {
  assetId: number;
  creator: string;
  owner: string;
  name: string;
  unitName: string;
  url: string;
  metadata: Record<string, unknown>;
  rarity?: string;
  power?: number;
}

type AlgorandLib = typeof import('algosdk');

export class AlgorandIntegration {
  private algod: any | null = null;
  private indexer: any | null = null;
  private sdk: AlgorandLib | null = null;
  private readonly config: AlgorandConfig;

  constructor(config?: Partial<AlgorandConfig>) {
    this.config = {
      apiUrl: process.env.ALGORAND_API_URL || 'https://mainnet-api.algonode.cloud',
      apiKey: process.env.ALGORAND_API_KEY || '',
      network: (process.env.ALGORAND_NETWORK as 'mainnet' | 'testnet') || 'mainnet',
      appId: Number(process.env.ALGORAND_APP_ID) || 0,
      assetId: Number(process.env.ALGORAND_ASSET_ID) || 0,
      ...config,
    } as AlgorandConfig;
  }

  async verifyWalletOwnership(userId: string, walletAddress: string): Promise<boolean> {
    try {
      const challenge = this.generateChallenge(userId);

      db.prepare(
        `INSERT OR REPLACE INTO wallet_verifications
         (user_id, wallet_address, chain, challenge, created_at, status)
         VALUES (?,?,?,?,?,?)`
      ).run(userId, walletAddress, 'algorand', challenge, Date.now(), 'pending');

      return true;
    } catch (error) {
      logger.error('Algorand wallet verification failed', { userId, walletAddress, error });
      return false;
    }
  }

  async verifySignature(userId: string, signature: string): Promise<boolean> {
    try {
      const verification = db
        .prepare(
          `SELECT * FROM wallet_verifications
           WHERE user_id=? AND chain='algorand' AND status='pending'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(userId) as
        | {
            wallet_address: string;
            challenge: string;
          }
        | undefined;

      if (!verification) {
        return false;
      }

      const isValid = await this.verifyAlgorandSignature(
        verification.wallet_address,
        verification.challenge,
        signature
      );

      if (!isValid) {
        return false;
      }

      db.prepare(
        `UPDATE wallet_verifications SET status='verified', verified_at=?
         WHERE user_id=? AND wallet_address=? AND chain='algorand'`
      ).run(Date.now(), userId, verification.wallet_address);

      this.linkWalletToUser(userId, verification.wallet_address);
      return true;
    } catch (error) {
      logger.error('Algorand signature verification failed', { userId, error });
      return false;
    }
  }

  async getNFTsForWallet(walletAddress: string): Promise<AlgorandNFT[]> {
    if (!walletAddress) return [];

    try {
      const algod = await this.ensureAlgod();
      if (!algod) return [];

      const accountInfo = await algod.accountInformation(walletAddress).do();
      const assets: { [key: string]: unknown }[] = accountInfo.assets || [];
      const nfts: AlgorandNFT[] = [];

      for (const asset of assets) {
        if (!asset || typeof asset !== 'object') continue;
        const amount = Number((asset as any).amount ?? 0);
        if (amount <= 0) continue;

        const assetId = Number((asset as any)['asset-id']);
        if (!assetId) continue;

        try {
          const info = await algod.getAssetByID(assetId).do();
          const params = info?.params ?? {};

          if (params.total !== 1 || params.decimals !== 0) {
            continue;
          }

          const parsed = await this.parseNFTMetadata(info, walletAddress);
          if (parsed) {
            nfts.push(parsed);
          }
        } catch (innerError) {
          logger.warn('Skipping non-NFT asset', { walletAddress, assetId, error: innerError });
        }
      }

      return nfts;
    } catch (error) {
      logger.error('Failed to fetch Algorand NFTs', { walletAddress, error });
      return [];
    }
  }

  async parseNFTMetadata(assetInfo: any, owner: string): Promise<AlgorandNFT | null> {
    try {
      const params = assetInfo?.params ?? {};
      let metadata: Record<string, unknown> = {};

      if (params.url) {
        try {
          const response = await globalThis.fetch(params.url as string);
          if (response.ok) {
            metadata = await response.json();
          }
        } catch (error) {
          logger.warn('Failed to fetch metadata URL', { url: params.url, error });
        }
      }

      if (params.note) {
        try {
          const raw = Buffer.from(params.note as string, 'base64').toString('utf-8');
          const parsed = JSON.parse(raw);
          metadata = { ...metadata, ...parsed };
        } catch (error) {
          logger.warn('Failed to parse ARC69 metadata', { assetId: assetInfo?.index, error });
        }
      }

      return {
        assetId: Number(assetInfo?.index) || 0,
        creator: (params.creator as string) || '',
        owner,
        name: (params.name as string) || `Asset #${assetInfo?.index}`,
        unitName: (params['unit-name'] as string) || '',
        url: (params.url as string) || '',
        metadata,
        rarity: (metadata?.rarity as string) || this.calculateRarity(metadata),
        power: (metadata?.power as number) || this.calculatePower(metadata),
      };
    } catch (error) {
      logger.error('Failed to parse Algorand NFT metadata', { assetId: assetInfo?.index, error });
      return null;
    }
  }

  async mintRewardNFT(
    userId: string,
    rewardType: string,
    metadata: Record<string, unknown>
  ): Promise<string | null> {
    try {
      const wallet = this.getUserWallet(userId);
      if (!wallet) {
        logger.warn('No Algorand wallet linked for user', { userId });
        return null;
      }

    const simulatedAssetId = Math.floor(Math.random() * 1_000_000);

      db.prepare(
        `INSERT INTO nft_rewards
         (id, user_id, wallet_address, chain, asset_id, reward_type, metadata_json, minted_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        `algo_${Date.now()}`,
        userId,
        wallet,
        'algorand',
        simulatedAssetId.toString(),
        rewardType,
        JSON.stringify(metadata),
        Date.now()
      );

      logger.info('Simulated Algorand NFT reward minted', {
        userId,
        rewardType,
        assetId: simulatedAssetId,
      });
      return `algo_${simulatedAssetId}`;
    } catch (error) {
      logger.error('Failed to mint Algorand NFT reward', { userId, rewardType, error });
      return null;
    }
  }

  private async ensureAlgod() {
    if (this.algod) return this.algod;
    const sdk = await this.loadSdk();
    if (!sdk) return null;

    this.algod = new sdk.Algodv2(this.config.apiKey, this.config.apiUrl, '');
    return this.algod;
  }

  private async ensureIndexer() {
    if (this.indexer) return this.indexer;
    const sdk = await this.loadSdk();
    if (!sdk) return null;

    const indexerUrl = this.config.apiUrl.replace('api', 'idx');
    this.indexer = new sdk.Indexer(this.config.apiKey, indexerUrl, '');
    return this.indexer;
  }

  private async loadSdk(): Promise<AlgorandLib | null> {
    if (this.sdk) return this.sdk;
    try {
      const sdk = await import('algosdk');
      this.sdk = sdk;
      return sdk;
    } catch (error) {
      logger.error('Failed to load algosdk library', { error });
      return null;
    }
  }

  private generateChallenge(userId: string): string {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).slice(2);
    return `LedgerLegends Authentication\nUser: ${userId}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
  }

  private async verifyAlgorandSignature(address: string, message: string, signature: string) {
    try {
      const sdk = await this.loadSdk();
      if (!sdk) return false;

      const sigBytes = Buffer.from(signature, 'base64');
      const messageBytes = new TextEncoder().encode(message);
      return sdk.verifyBytes(messageBytes, sigBytes, address);
    } catch (error) {
      logger.error('Algorand signature verification failed', { error });
      return false;
    }
  }

  private linkWalletToUser(userId: string, walletAddress: string) {
    db.prepare(
      `INSERT OR REPLACE INTO user_wallets (user_id, wallet_address, chain, linked_at, is_primary)
       VALUES (?,?,?,?,?)`
    ).run(userId, walletAddress, 'algorand', Date.now(), 1);
  }

  private getUserWallet(userId: string): string | null {
    const wallet = db
      .prepare(
        `SELECT wallet_address FROM user_wallets
         WHERE user_id=? AND chain='algorand' AND is_primary=1`
      )
      .get(userId) as { wallet_address: string } | undefined;

    return wallet?.wallet_address ?? null;
  }

  private calculateRarity(metadata: Record<string, unknown>): string {
    const attributes = (metadata?.attributes as Array<Record<string, unknown>>) || [];
    const rareTraits = attributes.filter((attr) => {
      const frequency = Number((attr as any).frequency ?? 0);
      return frequency > 0 && frequency < 0.1;
    });

    if (rareTraits.length >= 3) return 'mythic';
    if (rareTraits.length >= 2) return 'legendary';
    if (rareTraits.length >= 1) return 'epic';
    if (attributes.length >= 5) return 'rare';
    if (attributes.length >= 3) return 'uncommon';
    return 'common';
  }

  private calculatePower(metadata: Record<string, unknown>): number {
    const attributes = (metadata?.attributes as Array<Record<string, unknown>>) || [];
    let power = 0;

    for (const attribute of attributes) {
      const trait = (attribute as any).trait_type;
      const value = Number((attribute as any).value ?? 0);

      if (trait === 'attack' || trait === 'defense') power += value;
      if (trait === 'magic') power += value * 1.5;
      if (trait === 'speed') power += value * 0.5;
    }

    return Math.round(power);
  }
}

export const algorandIntegration = new AlgorandIntegration();
export const algorand = algorandIntegration;
