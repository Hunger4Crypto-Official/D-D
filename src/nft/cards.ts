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
