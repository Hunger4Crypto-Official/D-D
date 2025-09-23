import db from '../persistence/db.js';
import { Effect } from '../models.js';

export interface Card {
  id: string;
  tokenId?: number;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  type: 'action' | 'modifier' | 'instant' | 'equipment' | 'summon';
  cost: { focus?: number; hp?: number; coins?: number };
  effects: Effect[];
  tags: string[];
  artwork?: string;
  description: string;
  flavorText?: string;
  set: string;
  requiresClass?: string[];
  cooldown?: number;
}

export interface Deck {
  id: string;
  name: string;
  ownerId: string;
  cards: Card[];
  maxSize: number;
  theme?: string;
  bonuses?: DeckBonus[];
}

export interface DeckBonus {
  type: 'synergy' | 'combo' | 'tribal';
  requirement: string;
  effect: Effect;
  description: string;
}

// Card definitions
export const CARD_REGISTRY: Record<string, Card> = {
  // Dev Wizard Cards
  'dev_recursion': {
    id: 'dev_recursion',
    name: 'Infinite Recursion',
    rarity: 'epic',
    type: 'instant',
    cost: { focus: 3 },
    effects: [
      { type: 'buff', id: 'reroll_next', value: 1 },
      { type: 'flag', id: 'recursion_active', value: true }
    ],
    tags: ['dev', 'logic', 'instant'],
    description: 'Reroll your next failed action. If successful, draw another card.',
    flavorText: 'Stack overflow is just another kind of infinity.',
    set: 'genesis',
    requiresClass: ['dev']
  },
  
  'dev_debug_mode': {
    id: 'dev_debug_mode',
    name: 'Debug Mode',
    rarity: 'rare',
    type: 'modifier',
    cost: { focus: 2 },
    effects: [
      { type: 'buff', id: 'see_dc', value: 3 }, // See DC for next 3 actions
      { type: 'xp', value: 10 }
    ],
    tags: ['dev', 'insight', 'modifier'],
    description: 'Reveal difficulty checks for your next 3 actions.',
    set: 'genesis',
    requiresClass: ['dev']
  },

  // Trader Cards
  'trader_market_manipulation': {
    id: 'trader_market_manipulation',
    name: 'Market Manipulation',
    rarity: 'legendary',
    type: 'instant',
    cost: { coins: 1000 },
    effects: [
      { type: 'coins', op: '+', value: 2000 },
      { type: 'flag', id: 'market_volatile', value: true }
    ],
    tags: ['trader', 'economy', 'risk'],
    description: 'Double or nothing. 50% chance to gain 2000 coins or lose all.',
    set: 'genesis',
    requiresClass: ['trader']
  },

  'trader_hedge': {
    id: 'trader_hedge',
    name: 'Perfect Hedge',
    rarity: 'uncommon',
    type: 'modifier',
    cost: { focus: 1 },
    effects: [
      { type: 'buff', id: 'prevent_coin_loss', value: 1 }
    ],
    tags: ['trader', 'defense'],
    description: 'Prevent coin loss from your next failed action.',
    set: 'genesis'
  },

  // Gremlin Cards
  'gremlin_swarm': {
    id: 'gremlin_swarm',
    name: 'Gremlin Swarm',
    rarity: 'rare',
    type: 'summon',
    cost: { focus: 2 },
    effects: [
      { type: 'buff', id: 'gremlin_helpers', value: 3 },
      { type: 'flag', id: 'gremlin_chaos', value: true }
    ],
    tags: ['gremlin', 'chaos', 'summon'],
    description: 'Summon 3 gremlin helpers. They might help. Or not.',
    flavorText: 'Hehe.',
    set: 'genesis'
  },

  'gremlin_pocket_pick': {
    id: 'gremlin_pocket_pick',
    name: 'Pocket Pick',
    rarity: 'common',
    type: 'instant',
    cost: {},
    effects: [
      { type: 'coins', op: '+', value: 100 },
      { type: 'fragment', value: 5 }
    ],
    tags: ['gremlin', 'theft'],
    description: 'Quick fingers, quick profits.',
    set: 'genesis'
  },

  // Whale Cards
  'whale_weight_of_wealth': {
    id: 'whale_weight_of_wealth',
    name: 'Weight of Wealth',
    rarity: 'mythic',
    type: 'instant',
    cost: { coins: 5000 },
    effects: [
      { type: 'buff', id: 'auto_success_next', value: 1 },
      { type: 'flag', id: 'whale_presence', value: true }
    ],
    tags: ['whale', 'power', 'economy'],
    description: 'Your next action automatically succeeds. Money talks.',
    set: 'genesis',
    requiresClass: ['whale']
  },

  // Meme Lord Cards
  'meme_viral_moment': {
    id: 'meme_viral_moment',
    name: 'Viral Moment',
    rarity: 'epic',
    type: 'instant',
    cost: { focus: 1 },
    effects: [
      { type: 'buff', id: 'party_morale', value: 2 },
      { type: 'xp', value: 50 }
    ],
    tags: ['meme', 'social', 'party'],
    description: 'Your whole party gains +2 morale. Crit fails become regular fails for 1 round.',
    flavorText: 'We\'re all gonna make it.',
    set: 'genesis'
  },

  // Validator Cards
  'validator_consensus_check': {
    id: 'validator_consensus_check',
    name: 'Consensus Check',
    rarity: 'rare',
    type: 'action',
    cost: { focus: 2 },
    effects: [
      { type: 'buff', id: 'party_advantage', value: 1 }
    ],
    tags: ['validator', 'party', 'integrity'],
    description: 'All party members get advantage on their next integrity check.',
    set: 'genesis',
    requiresClass: ['validator']
  },

  // Universal Cards
  'universal_second_wind': {
    id: 'universal_second_wind',
    name: 'Second Wind',
    rarity: 'common',
    type: 'instant',
    cost: {},
    effects: [
      { type: 'hp', op: '+', value: 3 },
      { type: 'focus', op: '+', value: 1 }
    ],
    tags: ['recovery', 'universal'],
    description: 'Catch your breath. Restore 3 HP and 1 Focus.',
    set: 'genesis'
  },

  'universal_lucky_coin': {
    id: 'universal_lucky_coin',
    name: 'Lucky Coin',
    rarity: 'uncommon',
    type: 'instant',
    cost: { coins: 50 },
    effects: [
      { type: 'buff', id: 'luck', value: 1 }
    ],
    tags: ['luck', 'universal'],
    description: 'Flip a coin. Heads: advantage on next roll. Tails: nothing happens.',
    set: 'genesis'
  }
};

// Deck management
export class DeckManager {
  async createDeck(userId: string, name: string, theme?: string): Promise<Deck> {
    const deckId = `deck_${Date.now()}`;
    const deck: Deck = {
      id: deckId,
      name,
      ownerId: userId,
      cards: [],
      maxSize: 30,
      theme,
      bonuses: this.calculateDeckBonuses([])
    };
    
    db.prepare(
      'INSERT INTO player_decks (deck_id, user_id, name, theme, cards_json, created_at) VALUES (?,?,?,?,?,?)'
    ).run(deckId, userId, name, theme || null, '[]', Date.now());
    
    return deck;
  }

  async loadDeck(userId: string, deckId?: string): Promise<Deck | null> {
    const query = deckId 
      ? 'SELECT * FROM player_decks WHERE deck_id=? AND user_id=?'
      : 'SELECT * FROM player_decks WHERE user_id=? AND is_active=1';
    
    const params = deckId ? [deckId, userId] : [userId];
    const row = db.prepare(query).get(...params) as any;
    
    if (!row) return null;
    
    const cards = JSON.parse(row.cards_json || '[]')
      .map((id: string) => CARD_REGISTRY[id])
      .filter(Boolean);
    
    return {
      id: row.deck_id,
      name: row.name,
      ownerId: userId,
      cards,
      maxSize: 30,
      theme: row.theme,
      bonuses: this.calculateDeckBonuses(cards)
    };
  }

  async addCardToDeck(userId: string, deckId: string, cardId: string): Promise<boolean> {
    const deck = await this.loadDeck(userId, deckId);
    if (!deck) return false;
    
    const card = CARD_REGISTRY[cardId];
    if (!card) return false;
    
    // Check class requirements
    if (card.requiresClass) {
      const profile = db.prepare('SELECT selected_role FROM profiles WHERE user_id=?').get(userId) as any;
      if (!card.requiresClass.includes(profile.selected_role)) {
        return false;
      }
    }
    
    // Check deck size
    if (deck.cards.length >= deck.maxSize) return false;
    
    // Check card limit (max 3 of same card, 1 for legendary+)
    const sameCards = deck.cards.filter(c => c.id === cardId).length;
    if (card.rarity === 'legendary' || card.rarity === 'mythic') {
      if (sameCards >= 1) return false;
    } else {
      if (sameCards >= 3) return false;
    }
    
    deck.cards.push(card);
    const cardIds = deck.cards.map(c => c.id);
    
    db.prepare('UPDATE player_decks SET cards_json=?, updated_at=? WHERE deck_id=?')
      .run(JSON.stringify(cardIds), Date.now(), deckId);
    
    return true;
  }

  async removeCardFromDeck(userId: string, deckId: string, cardId: string): Promise<boolean> {
    const deck = await this.loadDeck(userId, deckId);
    if (!deck) return false;
    
    const index = deck.cards.findIndex(c => c.id === cardId);
    if (index === -1) return false;
    
    deck.cards.splice(index, 1);
    const cardIds = deck.cards.map(c => c.id);
    
    db.prepare('UPDATE player_decks SET cards_json=?, updated_at=? WHERE deck_id=?')
      .run(JSON.stringify(cardIds), Date.now(), deckId);
    
    return true;
  }

  calculateDeckBonuses(cards: Card[]): DeckBonus[] {
    const bonuses: DeckBonus[] = [];
    
    // Check for synergies
    const tagCounts: Record<string, number> = {};
    cards.forEach(card => {
      card.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    // Gremlin synergy
    if (tagCounts['gremlin'] >= 5) {
      bonuses.push({
        type: 'tribal',
        requirement: '5+ Gremlin cards',
        effect: { type: 'buff', id: 'gremlin_chaos_bonus', value: 2 },
        description: 'Gremlin actions have +2 sleight bonus'
      });
    }
    
    // Dev synergy
    if (tagCounts['dev'] >= 3 && tagCounts['logic'] >= 2) {
      bonuses.push({
        type: 'synergy',
        requirement: '3+ Dev & 2+ Logic cards',
        effect: { type: 'buff', id: 'debug_advantage', value: 1 },
        description: 'Puzzle and insight checks get advantage'
      });
    }
    // Economy synergy
    if (tagCounts['economy'] >= 4 || tagCounts['trader'] >= 3) {
      bonuses.push({
        type: 'synergy',
        requirement: '4+ Economy or 3+ Trader cards',
        effect: { type: 'coins', op: '+', value: 500 },
        description: 'Start each scene with +500 bonus coins'
      });
    }
    
    // Chaos combo
    if (tagCounts['chaos'] >= 3 && tagCounts['meme'] >= 2) {
      bonuses.push({
        type: 'combo',
        requirement: '3+ Chaos & 2+ Meme cards',
        effect: { type: 'buff', id: 'chaos_immunity', value: 1 },
        description: 'Immune to confusion and disadvantage from chaos effects'
      });
    }
    
    // Defensive synergy
    if (tagCounts['defense'] >= 3 || tagCounts['recovery'] >= 4) {
      bonuses.push({
        type: 'synergy',
        requirement: '3+ Defense or 4+ Recovery cards',
        effect: { type: 'hp', op: '+', value: 5 },
        description: '+5 max HP'
      });
    }
    
    return bonuses;
  }

  async setActiveDeck(userId: string, deckId: string): Promise<void> {
    db.prepare('UPDATE player_decks SET is_active=0 WHERE user_id=?').run(userId);
    db.prepare('UPDATE player_decks SET is_active=1 WHERE deck_id=? AND user_id=?')
      .run(deckId, userId);
  }
}

// Card execution engine
export class CardEngine {
  private cooldowns = new Map<string, Map<string, number>>(); // userId -> cardId -> timestamp
  private hand = new Map<string, Card[]>(); // runId -> cards in hand
  private discardPile = new Map<string, Card[]>(); // runId -> discarded cards
  
  async drawCard(runId: string, userId: string): Promise<Card | null> {
    const deck = await deckManager.loadDeck(userId);
    if (!deck || deck.cards.length === 0) return null;
    
    const runHand = this.hand.get(runId) || [];
    const runDiscard = this.discardPile.get(runId) || [];
    
    // Get available cards (not in hand or recently discarded)
    const usedCardIds = [...runHand, ...runDiscard].map(c => c.id);
    const availableCards = deck.cards.filter(c => {
      const uses = usedCardIds.filter(id => id === c.id).length;
      const maxUses = (c.rarity === 'legendary' || c.rarity === 'mythic') ? 1 : 3;
      return uses < maxUses;
    });
    
    if (availableCards.length === 0) {
      // Reshuffle discard pile
      this.discardPile.set(runId, []);
      return this.drawCard(runId, userId);
    }
    
    // Weighted draw based on rarity
    const weights: Record<string, number> = {
      common: 0.4,
      uncommon: 0.25,
      rare: 0.15,
      epic: 0.10,
      legendary: 0.07,
      mythic: 0.03
    };
    
    const card = this.weightedDraw(availableCards, weights);
    runHand.push(card);
    this.hand.set(runId, runHand);
    
    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
      .run(
        `card_draw_${Date.now()}`,
        runId,
        userId,
        'card.drawn',
        JSON.stringify({ card_id: card.id, rarity: card.rarity }),
        Date.now()
      );
    
    return card;
  }
  
  private weightedDraw(cards: Card[], weights: Record<string, number>): Card {
    const totalWeight = cards.reduce((sum, card) => sum + (weights[card.rarity] || 0.1), 0);
    let random = Math.random() * totalWeight;
    
    for (const card of cards) {
      random -= weights[card.rarity] || 0.1;
      if (random <= 0) return card;
    }
    
    return cards[0];
  }
  
  async playCard(runId: string, userId: string, cardId: string, targetId?: string): Promise<CardPlayResult> {
    const card = CARD_REGISTRY[cardId];
    if (!card) {
      return { success: false, message: 'Card not found' };
    }
    
    // Check if card is in hand
    const runHand = this.hand.get(runId) || [];
    const cardIndex = runHand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, message: 'Card not in hand' };
    }
    
    // Check cooldown
    if (card.cooldown) {
      const userCooldowns = this.cooldowns.get(userId) || new Map();
      const lastUsed = userCooldowns.get(cardId) || 0;
      const cooldownExpiry = lastUsed + (card.cooldown * 60000); // Convert minutes to ms
      
      if (Date.now() < cooldownExpiry) {
        const remaining = Math.ceil((cooldownExpiry - Date.now()) / 60000);
        return { success: false, message: `Card on cooldown for ${remaining} more minutes` };
      }
    }
    
    // Check cost
    const profile = db.prepare('SELECT hp, focus, coins FROM profiles WHERE user_id=?').get(userId) as any;
    if (card.cost.hp && profile.hp <= card.cost.hp) {
      return { success: false, message: 'Not enough HP to play this card' };
    }
    if (card.cost.focus && profile.focus < card.cost.focus) {
      return { success: false, message: 'Not enough Focus to play this card' };
    }
    if (card.cost.coins && profile.coins < card.cost.coins) {
      return { success: false, message: 'Not enough Coins to play this card' };
    }
    
    // Pay costs
    if (card.cost.hp) {
      db.prepare('UPDATE profiles SET hp=hp-? WHERE user_id=?').run(card.cost.hp, userId);
    }
    if (card.cost.focus) {
      db.prepare('UPDATE profiles SET focus=focus-? WHERE user_id=?').run(card.cost.focus, userId);
    }
    if (card.cost.coins) {
      db.prepare('UPDATE profiles SET coins=coins-? WHERE user_id=?').run(card.cost.coins, userId);
    }
    
    // Execute effects
    const results = await this.executeCardEffects(card, runId, userId, targetId);
    
    // Move card to discard
    runHand.splice(cardIndex, 1);
    this.hand.set(runId, runHand);
    
    const runDiscard = this.discardPile.get(runId) || [];
    runDiscard.push(card);
    this.discardPile.set(runId, runDiscard);
    
    // Set cooldown
    if (card.cooldown) {
      const userCooldowns = this.cooldowns.get(userId) || new Map();
      userCooldowns.set(cardId, Date.now());
      this.cooldowns.set(userId, userCooldowns);
    }
    
    // Log card play
    db.prepare('INSERT INTO events (event_id, run_id, user_id, type, payload_json, ts) VALUES (?,?,?,?,?,?)')
      .run(
        `card_play_${Date.now()}`,
        runId,
        userId,
        'card.played',
        JSON.stringify({ 
          card_id: card.id, 
          target_id: targetId,
          effects: results 
        }),
        Date.now()
      );
    
    return {
      success: true,
      message: `Played ${card.name}!`,
      effects: results,
      card
    };
  }
  
  private async executeCardEffects(
    card: Card, 
    runId: string, 
    userId: string, 
    targetId?: string
  ): Promise<EffectResult[]> {
    const results: EffectResult[] = [];
    const target = targetId || userId;
    
    for (const effect of card.effects) {
      const result = await this.executeEffect(effect, runId, target, card);
      results.push(result);
    }
    
    // Check for combo effects
    const runHand = this.hand.get(runId) || [];
    const comboResults = await this.checkCombos(card, runHand, runId, userId);
    results.push(...comboResults);
    
    return results;
  }
  
  private async executeEffect(
    effect: Effect, 
    runId: string, 
    targetId: string,
    card: Card
  ): Promise<EffectResult> {
    switch (effect.type) {
      case 'buff':
        return this.applyBuff(effect, runId, targetId, card);
      case 'hp':
      case 'focus':
      case 'coins':
      case 'xp':
        return this.applyStatChange(effect, targetId);
      case 'flag':
        return this.applyFlag(effect, runId);
      case 'item':
        return this.grantItem(effect, targetId);
      default:
        return { type: effect.type, success: false, message: 'Unknown effect type' };
    }
  }
  
  private async applyBuff(
    effect: Effect, 
    runId: string, 
    targetId: string,
    card: Card
  ): Promise<EffectResult> {
    const buffId = effect.id!;
    const duration = effect.value as number || 1;
    
    db.prepare(
      'INSERT INTO active_buffs (run_id, user_id, buff_id, source_card, duration, created_at) VALUES (?,?,?,?,?,?)'
    ).run(runId, targetId, buffId, card.id, duration, Date.now());
    
    return {
      type: 'buff',
      success: true,
      message: `Applied ${buffId} for ${duration} rounds`,
      value: duration
    };
  }
  
  private async applyStatChange(effect: Effect, targetId: string): Promise<EffectResult> {
    const value = effect.value as number;
    const op = effect.op || '+';
    const actualValue = op === '-' ? -value : value;
    
    const column = effect.type;
    db.prepare(`UPDATE profiles SET ${column}=${column}+? WHERE user_id=?`)
      .run(actualValue, targetId);
    
    return {
      type: effect.type,
      success: true,
      message: `${op}${value} ${column}`,
      value: actualValue
    };
  }
  
  private async applyFlag(effect: Effect, runId: string): Promise<EffectResult> {
    const run = db.prepare('SELECT flags_json FROM runs WHERE run_id=?').get(runId) as any;
    const flags = JSON.parse(run.flags_json || '{}');
    flags[effect.id!] = effect.value;
    
    db.prepare('UPDATE runs SET flags_json=? WHERE run_id=?')
      .run(JSON.stringify(flags), runId);
    
    return {
      type: 'flag',
      success: true,
      message: `Set flag ${effect.id}`,
      value: effect.value
    };
  }
  
  private async grantItem(effect: Effect, targetId: string): Promise<EffectResult> {
    const itemId = effect.id!;
    
    db.prepare(
      'INSERT INTO inventories (user_id, item_id, kind, rarity, qty, meta_json) VALUES (?,?,?,?,?,?) ' +
      'ON CONFLICT(user_id, item_id) DO UPDATE SET qty=qty+1'
    ).run(targetId, itemId, 'card_reward', 'unknown', 1, '{}');
    
    return {
      type: 'item',
      success: true,
      message: `Granted ${itemId}`,
      value: itemId
    };
  }
  
  private async checkCombos(
    playedCard: Card, 
    hand: Card[], 
    runId: string, 
    userId: string
  ): Promise<EffectResult[]> {
    const results: EffectResult[] = [];
    
    // Check for specific combos
    if (playedCard.id === 'dev_recursion' && hand.some(c => c.id === 'dev_debug_mode')) {
      results.push({
        type: 'combo',
        success: true,
        message: 'COMBO: Infinite Debug! Draw 2 cards',
        value: 2
      });
      
      // Draw 2 bonus cards
      await this.drawCard(runId, userId);
      await this.drawCard(runId, userId);
    }
    
    if (playedCard.tags.includes('gremlin') && hand.filter(c => c.tags.includes('gremlin')).length >= 2) {
      results.push({
        type: 'combo',
        success: true,
        message: 'COMBO: Gremlin Party! +100 coins',
        value: 100
      });
      
      db.prepare('UPDATE profiles SET coins=coins+100 WHERE user_id=?').run(userId);
    }
    
    return results;
  }
  
  async getHand(runId: string): Promise<Card[]> {
    return this.hand.get(runId) || [];
  }
  
  async getDiscardPile(runId: string): Promise<Card[]> {
    return this.discardPile.get(runId) || [];
  }
  
  async clearRunData(runId: string): void {
    this.hand.delete(runId);
    this.discardPile.delete(runId);
  }
}

// NFT Integration
export class NFTCardBridge {
  private chainProviders: Map<string, ChainProvider> = new Map();
  
  constructor() {
    // Initialize chain providers
    this.chainProviders.set('algorand', new AlgorandProvider());
    this.chainProviders.set('base', new BaseProvider());
    this.chainProviders.set('solana', new SolanaProvider());
  }
  
  async verifyNFTOwnership(
    userId: string, 
    walletAddress: string, 
    chain: string
  ): Promise<NFTCard[]> {
    const provider = this.chainProviders.get(chain);
    if (!provider) return [];
    
    try {
      const nfts = await provider.getNFTsForWallet(walletAddress);
      const validCards = nfts
        .filter(nft => this.isValidCardNFT(nft))
        .map(nft => this.convertNFTToCard(nft));
      
      // Cache ownership
      db.prepare(
        'INSERT OR REPLACE INTO nft_ownership (user_id, wallet_address, chain, nft_ids, verified_at) VALUES (?,?,?,?,?)'
      ).run(
        userId,
        walletAddress,
        chain,
        JSON.stringify(validCards.map(c => c.tokenId)),
        Date.now()
      );
      
      return validCards;
    } catch (err) {
      console.error('NFT verification failed:', err);
      return [];
    }
  }
  
  private isValidCardNFT(nft: any): boolean {
    // Check if NFT is from recognized collection
    const validCollections = [
      'ledger-legends-cards',
      'll-genesis-cards',
      'll-seasonal-cards'
    ];
    
    return validCollections.includes(nft.collection?.slug || '');
  }
  
  private convertNFTToCard(nft: any): NFTCard {
    const metadata = nft.metadata || {};
    const attributes = metadata.attributes || [];
    
    const cardId = attributes.find((a: any) => a.trait_type === 'card_id')?.value;
    const baseCard = CARD_REGISTRY[cardId] || this.createDynamicCard(nft);
    
    return {
      ...baseCard,
      tokenId: nft.tokenId,
      isNFT: true,
      chainId: nft.chain,
      contractAddress: nft.contractAddress,
      owner: nft.owner
    };
  }
  
  private createDynamicCard(nft: any): Card {
    const metadata = nft.metadata || {};
    const attributes = metadata.attributes || [];
    
    return {
      id: `nft_${nft.tokenId}`,
      tokenId: nft.tokenId,
      name: metadata.name || 'Unknown NFT Card',
      rarity: (attributes.find((a: any) => a.trait_type === 'rarity')?.value || 'common') as any,
      type: 'action',
      cost: {},
      effects: this.parseNFTEffects(attributes),
      tags: ['nft', 'unique'],
      description: metadata.description || 'A unique NFT card',
      artwork: metadata.image,
      set: 'nft'
    };
  }
  
  private parseNFTEffects(attributes: any[]): Effect[] {
    const effects: Effect[] = [];
    
    const power = attributes.find(a => a.trait_type === 'power')?.value || 1;
    const element = attributes.find(a => a.trait_type === 'element')?.value;
    
    if (element === 'fire') {
      effects.push({ type: 'hp', op: '-', value: power * 2 });
    } else if (element === 'water') {
      effects.push({ type: 'hp', op: '+', value: power });
      effects.push({ type: 'focus', op: '+', value: 1 });
    } else if (element === 'earth') {
      effects.push({ type: 'buff', id: 'defense', value: power });
    } else {
      effects.push({ type: 'xp', value: power * 10 });
    }
    
    return effects;
  }
}

// Chain providers (stubs - implement with actual SDKs)
interface ChainProvider {
  getNFTsForWallet(address: string): Promise<any[]>;
}

class AlgorandProvider implements ChainProvider {
  async getNFTsForWallet(address: string): Promise<any[]> {
    // Implement Algorand SDK calls
    // const algod = new algosdk.Algodv2(token, server, port);
    // const assets = await algod.accountInformation(address).do();
    return [];
  }
}

class BaseProvider implements ChainProvider {
  async getNFTsForWallet(address: string): Promise<any[]> {
    // Implement Base/Ethereum SDK calls
    // const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    // const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    return [];
  }
}

class SolanaProvider implements ChainProvider {
  async getNFTsForWallet(address: string): Promise<any[]> {
    // Implement Solana SDK calls
    // const connection = new Connection(clusterApiUrl('mainnet-beta'));
    // const nfts = await getParsedNftAccountsByOwner({connection, owner: address});
    return [];
  }
}

// Types
export interface CardPlayResult {
  success: boolean;
  message: string;
  effects?: EffectResult[];
  card?: Card;
}

export interface EffectResult {
  type: string;
  success: boolean;
  message: string;
  value?: any;
}

export interface NFTCard extends Card {
  isNFT: boolean;
  chainId: string;
  contractAddress: string;
  owner: string;
}

// Export singletons
export const deckManager = new DeckManager();
export const cardEngine = new CardEngine();
export const nftBridge = new NFTCardBridge();
