import { randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import db from '../persistence/db.js';
import { logger } from '../utils/logger.js';

type EthersLib = typeof import('ethers');

type BaseNFTRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

type Attribute = {
  trait_type?: string;
  value?: unknown;
};

export interface BaseNFT {
  tokenId: string;
  owner: string;
  contractAddress: string;
  chain: 'base';
  name: string;
  description: string;
  image: string;
  attributes: Attribute[];
  rarity: BaseNFTRarity;
  power: number;
}

const LEDGER_LEGENDS_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function mintReward(address to, uint256 rewardType, string memory metadata) returns (uint256)',
  'event RewardMinted(address indexed to, uint256 indexed tokenId, uint256 rewardType)'
] as const;

interface BaseIntegrationConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey?: string;
}

export class BaseIntegration {
  private ethersLib: EthersLib | null = null;
  private provider: any | null = null;
  private contract: any | null = null;
  private contractInterface: any | null = null;
  private readonly config: BaseIntegrationConfig;

  constructor() {
    this.config = {
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      contractAddress: process.env.BASE_CONTRACT_ADDRESS || '',
      privateKey: process.env.BASE_PRIVATE_KEY
    };
  }

  async verifyWalletOwnership(userId: string, walletAddress: string): Promise<boolean> {
    try {
      const nonce = this.generateNonce();
      const message = `LedgerLegends Authentication\nWallet: ${walletAddress}\nNonce: ${nonce}`;

      db.prepare(
        `INSERT OR REPLACE INTO wallet_verifications
         (user_id, wallet_address, chain, challenge, created_at, status)
         VALUES (?,?,?,?,?,?)`
      ).run(userId, walletAddress, 'base', message, Date.now(), 'pending');

      return true;
    } catch (error) {
      logger.error('Base wallet verification failed', { userId, walletAddress, error });
      return false;
    }
  }

  async verifySignature(userId: string, signature: string): Promise<boolean> {
    try {
      const verification = db
        .prepare(
          `SELECT * FROM wallet_verifications
           WHERE user_id=? AND chain='base' AND status='pending'
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

      const ethers = await this.loadEthers();
      const recoveredAddress = ethers.verifyMessage(verification.challenge, signature);

      if (recoveredAddress.toLowerCase() !== verification.wallet_address.toLowerCase()) {
        return false;
      }

      db.prepare(
        `UPDATE wallet_verifications
         SET status='verified', verified_at=?
         WHERE user_id=? AND wallet_address=? AND chain='base'`
      ).run(Date.now(), userId, verification.wallet_address);

      this.linkWalletToUser(userId, verification.wallet_address);
      return true;
    } catch (error) {
      logger.error('Signature verification failed', { userId, error });
      return false;
    }
  }

  async getNFTsForWallet(walletAddress: string): Promise<BaseNFT[]> {
    if (!walletAddress) return [];

    try {
      const contract = await this.ensureContract();
      if (!contract) {
        return [];
      }

      const balanceRaw = await contract.balanceOf(walletAddress);
      const balance = this.normalizeBigInt(balanceRaw);
      const nfts: BaseNFT[] = [];

      for (let index = 0; index < balance; index += 1) {
        const tokenIdRaw = await contract.tokenOfOwnerByIndex(walletAddress, index);
        const tokenId = this.normalizeBigInt(tokenIdRaw).toString();
        const uri: string = await contract.tokenURI(tokenIdRaw);
        const metadata = await this.fetchMetadata(uri);

        nfts.push({
          tokenId,
          owner: walletAddress,
          contractAddress: this.config.contractAddress,
          chain: 'base',
          name: (metadata?.name as string) || `LedgerLegends #${tokenId}`,
          description: (metadata?.description as string) || '',
          image: (metadata?.image as string) || '',
          attributes: (metadata?.attributes as Attribute[]) || [],
          rarity: this.calculateRarity((metadata?.attributes as Attribute[]) || []),
          power: this.calculatePower((metadata?.attributes as Attribute[]) || [])
        });
      }

      return nfts;
    } catch (error) {
      logger.error('Failed to fetch Base NFTs', { walletAddress, error });
      return [];
    }
  }

  async mintRewardNFT(
    userId: string,
    rewardType: number,
    metadata: Record<string, unknown>
  ): Promise<string | null> {
    try {
      const wallet = this.getUserWallet(userId);
      if (!wallet) {
        logger.warn('No wallet linked for user', { userId });
        return null;
      }

      const contractWithSigner = await this.getContractWithSigner();
      if (!contractWithSigner) {
        return null;
      }

      const tx = await contractWithSigner.mintReward(wallet, rewardType, JSON.stringify(metadata));
      const receipt = await tx.wait();

      const parsed = this.parseMintEvent(receipt?.logs ?? []);
      if (!parsed) {
        return null;
      }

      const rewardId = `base_${parsed.tokenId}`;
      db.prepare(
        `INSERT INTO nft_rewards
         (id, user_id, wallet_address, chain, asset_id, reward_type, metadata_json, minted_at, tx_hash)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(
        nanoid(12),
        userId,
        wallet,
        'base',
        parsed.tokenId,
        rewardType.toString(),
        JSON.stringify(metadata),
        Date.now(),
        receipt?.hash ?? ''
      );

      logger.info('NFT reward minted on Base', { userId, tokenId: parsed.tokenId, txHash: receipt?.hash });
      return rewardId;
    } catch (error) {
      logger.error('Failed to mint NFT on Base', { userId, rewardType, error });
      return null;
    }
  }

  private async fetchMetadata(uri: string): Promise<any> {
    try {
      if (!uri) return {};

      const normalized = uri.startsWith('ipfs://')
        ? `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`
        : uri;

      const response = await fetch(normalized, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Metadata fetch failed with status ${response.status}`);
      }

      return response.json();
    } catch (error) {
      logger.warn('Failed to fetch NFT metadata', { uri, error });
      return {};
    }
  }

  private async ensureContract(): Promise<any | null> {
    if (!this.config.contractAddress) {
      logger.warn('Base contract address not configured');
      return null;
    }

    if (this.contract) {
      return this.contract;
    }

    const ethers = await this.loadEthers();
    const provider = await this.ensureProvider();
    if (!provider) {
      return null;
    }

    this.contract = new ethers.Contract(this.config.contractAddress, LEDGER_LEGENDS_ABI, provider);
    return this.contract;
  }

  private async ensureProvider(): Promise<any | null> {
    if (this.provider) {
      return this.provider;
    }

    try {
      const ethers = await this.loadEthers();
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      return this.provider;
    } catch (error) {
      logger.error('Failed to initialize Base provider', { error });
      return null;
    }
  }

  private async getContractWithSigner(): Promise<any | null> {
    if (!this.config.privateKey) {
      logger.error('No private key configured for Base integration');
      return null;
    }

    const ethers = await this.loadEthers();
    const provider = await this.ensureProvider();
    if (!provider) {
      return null;
    }

    return new ethers.Contract(
      this.config.contractAddress,
      LEDGER_LEGENDS_ABI,
      new ethers.Wallet(this.config.privateKey, provider)
    );
  }

  private async loadEthers(): Promise<EthersLib> {
    if (this.ethersLib) {
      return this.ethersLib;
    }

    try {
      const mod = await import('ethers');
      this.ethersLib = mod;
      this.contractInterface = new mod.Interface(LEDGER_LEGENDS_ABI);
      return mod;
    } catch (error) {
      logger.error('Ethers library unavailable', { error });
      throw new Error('Ethers library unavailable');
    }
  }

  private parseMintEvent(logs: Array<{ topics?: string[]; data?: string }>): { tokenId: string } | null {
    if (!this.contractInterface) {
      return null;
    }

    for (const log of logs) {
      if (!log?.topics) continue;
      try {
        const parsed = this.contractInterface.parseLog({
          topics: log.topics,
          data: log.data ?? '0x'
        });

        if (parsed?.name === 'RewardMinted') {
          const candidate = (parsed.args as Record<string, unknown>)?.tokenId ??
            (Array.isArray(parsed?.args) ? parsed.args[1] : undefined);

          if (candidate != null) {
            return { tokenId: this.normalizeBigInt(candidate).toString() };
          }
        }
      } catch (error) {
        logger.debug('Failed to parse mint event log', { error });
      }
    }

    for (const log of logs) {
      const tokenTopic = log?.topics?.[2];
      if (tokenTopic) {
        try {
          return { tokenId: this.normalizeBigInt(tokenTopic).toString() };
        } catch (error) {
          logger.debug('Failed to decode token topic', { error });
        }
      }
    }

    return null;
  }

  private calculateRarity(attributes: Attribute[]): BaseNFTRarity {
    const rarityAttr = attributes.find((attr) =>
      typeof attr?.trait_type === 'string' && attr.trait_type.toLowerCase() === 'rarity'
    );

    if (rarityAttr && typeof rarityAttr.value === 'string') {
      const normalized = rarityAttr.value.toLowerCase();
      if (['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(normalized)) {
        return normalized as BaseNFTRarity;
      }
    }

    const numericScore = attributes.reduce((score, attr) => {
      if (typeof attr?.value === 'number') {
        return score + attr.value;
      }

      const maybeNumber = Number(attr?.value);
      return Number.isFinite(maybeNumber) ? score + maybeNumber : score;
    }, 0);

    if (numericScore >= 50) return 'legendary';
    if (numericScore >= 30) return 'epic';
    if (numericScore >= 20) return 'rare';
    if (numericScore >= 10) return 'uncommon';
    return 'common';
  }

  private calculatePower(attributes: Attribute[]): number {
    const powerAttr = attributes.find((attr) =>
      typeof attr?.trait_type === 'string' && attr.trait_type.toLowerCase() === 'power'
    );

    if (powerAttr) {
      const direct = Number(powerAttr.value);
      if (Number.isFinite(direct)) {
        return Math.max(0, Math.floor(direct));
      }
    }

    const aggregate = attributes.reduce((total, attr) => {
      if (typeof attr?.value === 'number') {
        return total + attr.value;
      }

      const parsed = Number(attr?.value);
      return Number.isFinite(parsed) ? total + parsed : total;
    }, 0);

    return Math.max(0, Math.floor(aggregate / Math.max(attributes.length, 1)));
  }

  private linkWalletToUser(userId: string, walletAddress: string) {
    const existing = db
      .prepare(
        'SELECT nft_ids FROM nft_ownership WHERE user_id=? AND chain=?'
      )
      .get(userId, 'base') as { nft_ids?: string } | undefined;

    db.prepare(
      `INSERT OR REPLACE INTO nft_ownership
       (user_id, wallet_address, chain, nft_ids, verified_at)
       VALUES (?,?,?,?,?)`
    ).run(
      userId,
      walletAddress,
      'base',
      existing?.nft_ids ?? '[]',
      Date.now()
    );
  }

  private getUserWallet(userId: string): string | null {
    const row = db
      .prepare(
        `SELECT wallet_address FROM wallet_verifications
         WHERE user_id=? AND chain='base' AND status='verified'
         ORDER BY verified_at DESC LIMIT 1`
      )
      .get(userId) as { wallet_address: string } | undefined;

    return row?.wallet_address ?? null;
  }

  private generateNonce(): string {
    return randomBytes(16).toString('hex');
  }

  private normalizeBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string' && value.startsWith('0x')) {
      return BigInt(value);
    }
    if (typeof value === 'string') {
      return BigInt(Number(value));
    }
    if (value && typeof (value as { toString: () => string }).toString === 'function') {
      return BigInt((value as { toString: () => string }).toString());
    }
    return BigInt(0);
  }
}

export const baseIntegration = new BaseIntegration();
export const base = baseIntegration;
