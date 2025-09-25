import type { SceneDef } from '../models.js';

export interface VoiceChannelLike {
  id: string;
}

export interface VoiceChannelAdapter {
  playNarration(text: string): Promise<void>;
  playSoundEffect(effect: string): Promise<void>;
  playMusic(track: string, loop?: boolean): Promise<void>;
  stopMusic(): Promise<void>;
}

export class VoiceRPGSession {
  private soundEffectsEnabled = true;
  private currentTrack: string | null = null;

  constructor(private readonly adapter: VoiceChannelAdapter) {}

  async startNarration(channel: VoiceChannelLike, scene: SceneDef): Promise<void> {
    const intro = `Entering scene ${scene.scene_id}: ${scene.title}`;
    await this.adapter.playNarration(intro);
    await this.adapter.playNarration(scene.narration);
    if (this.soundEffectsEnabled) {
      await this.adapter.playSoundEffect('scene_transition');
    }
    void channel; // touch parameter to satisfy lint/tsconfig even if adapter handles audio only
  }

  enableSoundEffects(enabled: boolean): void {
    this.soundEffectsEnabled = enabled;
  }

  async playAmbientMusic(track: string, loop = true): Promise<void> {
    if (this.currentTrack === track) return;
    if (this.currentTrack) {
      await this.adapter.stopMusic();
    }
    this.currentTrack = track;
    await this.adapter.playMusic(track, loop);
    if (this.soundEffectsEnabled) {
      await this.adapter.playSoundEffect('music_fade_in');
    }
  }
}
