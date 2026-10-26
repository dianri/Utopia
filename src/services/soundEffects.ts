/**
 * Servicio de Sonidos Procedurales mediante Web Audio API
 * y Hápticos mediante Navigator Vibration API.
 * Funciona 100% offline sin archivos de audio externos.
 */

class SoundEffectsService {
  private ctx: AudioContext | null = null;
  private stealthMode: boolean = false;
  private heartbeatInterval: number | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Escuchar el modo de sigilo guardado en localStorage
    this.stealthMode = localStorage.getItem('monster_hunt_stealth') === 'true';
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setStealthMode(enabled: boolean) {
    this.stealthMode = enabled;
    localStorage.setItem('monster_hunt_stealth', String(enabled));
    if (enabled) {
      this.stopHeartbeat();
    }
  }

  public isStealth(): boolean {
    return this.stealthMode;
  }

  /**
   * Desbloquea de forma perezosa el AudioContext tras la primera interacción
   * del usuario respetando las políticas de reproducción automática (autoplay) de iOS/Android
   */
  public initOnUserInteraction() {
    this.initContext();
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // ==========================================
  // RETROALIMENTACIÓN HÁPTICA (VIBRACIÓN)
  // ==========================================

  public vibrate(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignorar si el navegador no lo soporta o bloquea en background
      }
    }
  }

  /**
   * Vibración de proximidad proporcional a la distancia del monstruo (en metros)
   */
  public triggerProximityHaptics(distanceMeters: number, isEnraged: boolean) {
    if (distanceMeters > 90) return;

    if (distanceMeters <= 20) {
      // Peligro crítico: pulsaciones rápidas y agresivas
      this.vibrate(isEnraged ? [150, 40, 150, 40, 200] : [100, 50, 100]);
    } else if (distanceMeters <= 50) {
      // Zona media
      this.vibrate([60, 120, 60]);
    } else {
      // Detección inicial lejana
      this.vibrate(40);
    }
  }

  public triggerDamageHaptics() {
    this.vibrate([120, 50, 120, 50, 180]);
  }

  public triggerRoarHaptics() {
    this.vibrate([300, 100, 400, 100, 500]);
  }

  // ==========================================
  // SINTETIZADOR DE EFECTOS DE AUDIO WEB
  // ==========================================

  /**
   * Disparo de arma sintetizado con ruido blanco modulado y caída exponencial
   */
  public playGunshot(type: 'pistol' | 'shotgun' | 'rifle' | 'melee' = 'pistol') {
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'melee') {
      // Sonido de golpe / swish
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      return;
    }

    // Generador de ruido blanco para el estallido
    const bufferSize = ctx.sampleRate * (type === 'shotgun' ? 0.35 : type === 'rifle' ? 0.18 : 0.22);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filtro pasa-bajos para darle cuerpo al disparo
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'shotgun' ? 1200 : 2500, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + (type === 'shotgun' ? 0.3 : 0.18));

    // Sub-bass thump para pegada
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(type === 'shotgun' ? 120 : 160, now);
    subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + (type === 'shotgun' ? 0.35 : 0.2));

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    subOsc.start(now);
    subOsc.stop(now + 0.15);
    noise.start(now);
  }

  /**
   * Rugido aterrador del monstruo (frecuencias graves con modulación de frecuencia)
   */
  public playMonsterRoar() {
    this.triggerRoarHaptics();
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 1.8;

    // Oscilador portador
    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(90, now);
    carrier.frequency.linearRampToValueAtTime(140, now + 0.4);
    carrier.frequency.exponentialRampToValueAtTime(45, now + duration);

    // Oscilador modulador para vibrato gutural
    const modulator = ctx.createOscillator();
    modulator.type = 'triangle';
    modulator.frequency.setValueAtTime(25, now);
    modulator.frequency.linearRampToValueAtTime(12, now + duration);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(80, now);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.linearRampToValueAtTime(900, now + 0.5);
    filter.frequency.exponentialRampToValueAtTime(150, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.8, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    carrier.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    carrier.start(now);
    modulator.start(now);
    carrier.stop(now + duration);
    modulator.stop(now + duration);
  }

  /**
   * Latido de corazón con subgraves cuando la vida es baja o el monstruo está encima
   */
  public playHeartbeatThump() {
    this.vibrate([60, 80, 80]);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const triggerThump = (time: number, freq: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);

      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.13);
    };

    // Doble latido característico (lub-dub)
    triggerThump(now, 75, 0.7);
    triggerThump(now + 0.15, 65, 0.5);
  }

  public startHeartbeat(intervalMs: number = 900) {
    if (this.heartbeatInterval) return;
    this.playHeartbeatThump();
    this.heartbeatInterval = window.setInterval(() => {
      this.playHeartbeatThump();
    }, intervalMs);
  }

  public stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Alarma táctica cuando un aliado cae o el monstruo ataca
   */
  public playAlarm() {
    this.vibrate([100, 50, 100, 50, 100]);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(600, now + 0.1);
    osc.frequency.setValueAtTime(800, now + 0.2);
    osc.frequency.setValueAtTime(600, now + 0.3);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Ping de radar de alta frecuencia para el Explorador
   */
  public playRadarPing() {
    this.vibrate(50);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.4);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Apertura de caja de suministros / loot
   */
  public playCrateLoot() {
    this.vibrate([40, 40, 60]);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);

      gain.gain.setValueAtTime(0.3, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.06 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.2);
    });
  }

  /**
   * Fanfarria triunfal de victoria al abrir el cofre
   */
  public playVictoryFanfare() {
    this.vibrate([150, 100, 150, 100, 300]);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.15 }, // E5
      { f: 783.99, d: 0.15 }, // G5
      { f: 1046.50, d: 0.45 } // C6
    ];

    let t = now;
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(n.f, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + n.d);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.d);
      t += n.d;
    });
  }

  /**
   * Sonido sombrío de derrota
   */
  public playDefeat() {
    this.vibrate([400, 200, 400]);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 1.2);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  /**
   * Sonido cuando un fantasma emite un ping táctico
   */
  public playGhostPing() {
    this.vibrate(80);
    if (this.stealthMode || this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

export const soundEffects = new SoundEffectsService();
