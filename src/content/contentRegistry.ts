import fs from 'fs-extra';
import path from 'path';
import { CFG } from '../config.js';

export interface ItemDefinition {
  id: string;
  name: string;
  type: string;
  slot?: string;
  rarity: string;
  emoji: string;
  description: string;
  bonuses?: any;
  setKey?: string;
  durability?: number;
}

export interface CardDefinition {
  id: string;
  name: string;
  rarity: string;
  type: string;
  cost: any;
  effects: any[];
  tags: string[];
  description: string;
  flavorText?: string;
  set: string;
  requiresClass?: string[];
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  banter_key: string;
  startingStats?: any;
  passiveEffects?: any[];
  advantageTags?: string[];
  unlockRequirements?: any;
}

class ContentRegistry {
  private items: Map<string, ItemDefinition> = new Map();
  private cards: Map<string, CardDefinition> = new Map();
  private roles: Map<string, RoleDefinition> = new Map();
  private loaded = false;
  private version = 0;
  private reloadListeners = new Set<() => void>();

  async loadAll() {
    this.ensureLoadedSync();
  }

  getVersion() {
    this.ensureLoadedSync();
    return this.version;
  }

  getItem(id: string): ItemDefinition | undefined {
    this.ensureLoadedSync();
    return this.items.get(id);
  }

  getCard(id: string): CardDefinition | undefined {
    this.ensureLoadedSync();
    return this.cards.get(id);
  }

  getRole(id: string): RoleDefinition | undefined {
    this.ensureLoadedSync();
    return this.roles.get(id);
  }

  getAllItems(): ItemDefinition[] {
    this.ensureLoadedSync();
    return Array.from(this.items.values());
  }

  getAllCards(): CardDefinition[] {
    this.ensureLoadedSync();
    return Array.from(this.cards.values());
  }

  getAllRoles(): RoleDefinition[] {
    this.ensureLoadedSync();
    return Array.from(this.roles.values());
  }

  getItemsByType(type: string): ItemDefinition[] {
    return this.getAllItems().filter((item) => item.type === type);
  }

  getCardsBySet(set: string): CardDefinition[] {
    return this.getAllCards().filter((card) => card.set === set);
  }

  getRolesByUnlockRequirement(requirement: any): RoleDefinition[] {
    return this.getAllRoles().filter((role) => !role.unlockRequirements || this.meetsRequirement(requirement, role.unlockRequirements));
  }

  onReload(listener: () => void) {
    this.reloadListeners.add(listener);
    return () => this.reloadListeners.delete(listener);
  }

  async reload() {
    this.loadFromDisk();
  }

  private ensureLoadedSync() {
    if (this.loaded) return;
    this.loadFromDisk();
  }

  private loadFromDisk() {
    const itemsPath = path.join(CFG.contentRoot, 'registry', 'items.json');
    const cardsPath = path.join(CFG.contentRoot, 'registry', 'cards.json');
    const rolesPath = path.join(CFG.contentRoot, 'registry', 'roles.json');

    this.items.clear();
    this.cards.clear();
    this.roles.clear();

    this.loadItems(itemsPath);
    this.loadCards(cardsPath);
    this.loadRoles(rolesPath);

    this.loaded = true;
    this.version += 1;
    this.notifyReload();
  }

  private loadItems(filePath: string) {
    try {
      if (!fs.pathExistsSync(filePath)) return;
      const data = fs.readJSONSync(filePath) as { items?: Record<string, ItemDefinition> };
      if (!data?.items) return;
      for (const [id, item] of Object.entries(data.items)) {
        this.items.set(id, item);
      }
      console.log(`Loaded ${this.items.size} items`);
    } catch (error) {
      console.warn('Failed to load items registry:', error);
    }
  }

  private loadCards(filePath: string) {
    try {
      if (!fs.pathExistsSync(filePath)) return;
      const data = fs.readJSONSync(filePath) as { cards?: Record<string, CardDefinition> };
      if (!data?.cards) return;
      for (const [id, card] of Object.entries(data.cards)) {
        this.cards.set(id, card);
      }
      console.log(`Loaded ${this.cards.size} cards`);
    } catch (error) {
      console.warn('Failed to load cards registry:', error);
    }
  }

  private loadRoles(filePath: string) {
    try {
      if (!fs.pathExistsSync(filePath)) return;
      const data = fs.readJSONSync(filePath) as { roles?: Record<string, RoleDefinition> };
      if (!data?.roles) return;
      for (const [id, role] of Object.entries(data.roles)) {
        this.roles.set(id, role);
      }
      console.log(`Loaded ${this.roles.size} roles`);
    } catch (error) {
      console.warn('Failed to load roles registry:', error);
    }
  }

  private meetsRequirement(_userProgress: any, _requirement: any): boolean {
    // Requirement checking can be implemented later.
    return true;
  }

  private notifyReload() {
    for (const listener of this.reloadListeners) {
      try {
        listener();
      } catch (error) {
        console.error('Content reload listener failed', error);
      }
    }
  }
}

export const contentRegistry = new ContentRegistry();

contentRegistry.loadAll().catch((error) => {
  console.error('Failed to load content registry on startup', error);
});

if (process.env.NODE_ENV === 'development') {
  const watchPath = path.join(CFG.contentRoot, 'registry');
  if (fs.pathExistsSync(watchPath)) {
    try {
      fs.watch(watchPath, { recursive: true }, () => {
        setTimeout(() => {
          contentRegistry.reload().catch((error) => console.error('Registry reload failed', error));
        }, 1000);
      });
    } catch (error) {
      console.warn('Registry watch unavailable on this platform:', error);
    }
  }
}
