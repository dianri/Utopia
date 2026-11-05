import React, { useState, useEffect, useRef } from 'react';
import type { MovementMode, PlayerRole, Coordinates, PlayerSpeed } from '../../types/game';
import { MapPin, Navigation, Play, Globe, Lock, Gauge } from 'lucide-react';
import { RoleSelectorGrid } from './RoleSelectionModal';

interface CreateRoomModalProps {
  onConfirm: (config: {
    roomName: string;
    isPublic: boolean;
    radiusMeters: number;
    movementMode: MovementMode;
    playerSpeed: PlayerSpeed;
    center: Coordinates;
    nickname: string;
    role: PlayerRole;
  }) => void;
  onCancel: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ onConfirm, onCancel }) => {
  const [roomName, setRoomName] = useState<string>('Las Meriendas Hunt');
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [radiusKm, setRadiusKm] = useState<number>(0.35); // 0.1 a 3.0 km (100m a 3000m de radio)
  const [movementMode, setMovementMode] = useState<MovementMode>('manual');
  const [playerSpeed, setPlayerSpeed] = useState<PlayerSpeed>('normal');
  const [nickname, setNickname] = useState<string>('');
  const [role, setRole] = useState<PlayerRole>('scout');
  const [center, setCenter] = useState<Coordinates>({
    lat: 40.3458, // Coordenada configurable (Alcorcón / GPS del dispositivo)
    lng: -3.8249,
  });
  const [isLoadingGps, setIsLoadingGps] = useState<boolean>(false);
  const [gpsObtained, setGpsObtained] = useState<boolean>(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState<boolean>(false);
  const playerNameInputRef = useRef<HTMLInputElement>(null);

  const isPlayerNameValid = nickname.trim().length > 0;

  const fetchCurrentLocation = () => {
    if (navigator.geolocation) {
      setIsLoadingGps(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCenter({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setGpsObtained(true);
          setIsLoadingGps(false);
        },
        (err) => {
          console.warn('GPS no disponible:', err.message);
          setIsLoadingGps(false);
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  };

  // Intentar obtener GPS inicial del usuario al abrir modal
  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  // Radio en metros a partir del valor en km (mínimo garantizado: 100m)
  const radiusMeters = Math.max(100, Math.round(radiusKm * 1000));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    if (!isPlayerNameValid) {
      playerNameInputRef.current?.focus();
      return;
    }

    onConfirm({
      roomName: roomName.trim() || 'Las Meriendas Hunt',
      isPublic,
      radiusMeters,
      movementMode,
      playerSpeed,
      center,
      nickname: nickname.trim(),
      role,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-hud-dark border border-hud-border/80 w-full max-w-lg rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5 my-auto">
        <div className="flex items-center justify-between border-b border-hud-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚔️</span>
            <h2 className="text-lg font-mono font-black text-white uppercase tracking-wider">
              Crear Operación de Caza
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-hud-muted hover:text-white font-mono text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* NOMBRE DE SALA Y APODO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                NOMBRE DE LA SALA
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 transition-all outline-none"
                placeholder="Ej. Las Meriendas Hunt"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                NOMBRE DE AGENTE <span className="text-red-400">*</span>
              </label>
              <input
                ref={playerNameInputRef}
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={16}
                placeholder="Introduce tu alias o indicativo..."
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm transition-all outline-none ${
                  hasAttemptedSubmit && !isPlayerNameValid
                    ? 'border-red-500 bg-red-950/25 text-red-200 placeholder-red-400/50 shadow-[0_0_12px_rgba(239,68,68,0.35)] focus:border-red-400 focus:ring-red-500/50'
                    : 'border-slate-700 bg-slate-900/80 text-slate-100 placeholder-slate-500 focus:border-cyan-400'
                }`}
              />
              {hasAttemptedSubmit && !isPlayerNameValid && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-red-400 animate-fadeIn">
                  ⚠️ El nombre de agente es obligatorio para desplegarte en la zona.
                </span>
              )}
            </div>
          </div>

          {/* VISIBILIDAD DE LA SALA (PÚBLICA VS PRIVADA) */}
          <div className="bg-hud-panel border border-hud-border p-3 rounded-xl flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-hud-muted">Privacidad de la Partida:</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-black tracking-wider uppercase border ${
                  isPublic
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                }`}
              >
                {isPublic ? '🌐 Pública (En lista)' : '🔒 Privada (Solo código)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border font-mono text-xs transition-all text-left ${
                  isPublic
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 shadow-md shadow-emerald-500/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted hover:border-hud-border/80'
                }`}
              >
                <div className="flex items-center gap-1.5 font-black uppercase text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Pública</span>
                </div>
                <span className="text-[10px] opacity-80 leading-tight">
                  Visible en el lobby para que cualquiera pueda unirse directamente.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border font-mono text-xs transition-all text-left ${
                  !isPublic
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300 shadow-md shadow-amber-500/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted hover:border-hud-border/80'
                }`}
              >
                <div className="flex items-center gap-1.5 font-black uppercase text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Privada</span>
                </div>
                <span className="text-[10px] opacity-80 leading-tight">
                  Oculta del lobby; solo accesible con código de 6 letras o enlace.
                </span>
              </button>
            </div>
          </div>

          {/* TAMAÑO DE LA ZONA DE JUEGO */}
          <div className="bg-hud-panel border border-hud-border p-3 rounded-xl flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-hud-muted">Radio de la Zona:</span>
              <span className="text-hud-cyan font-bold">
                {radiusKm.toFixed(1)} km (~{radiusMeters}m radio)
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={radiusKm}
              onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
              className="accent-hud-cyan w-full cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-hud-muted">
              <span>0.1 km (100m)</span>
              <span>0.35 km (Estándar)</span>
              <span>3.0 km (3000m)</span>
            </div>
          </div>

          {/* MODO DE MOVIMIENTO */}
          <div className="bg-hud-panel border border-hud-border p-3 rounded-xl flex flex-col gap-2">
            <label className="block text-xs font-mono text-hud-muted">
              Modo de Movimiento
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMovementMode('manual')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border font-mono text-xs font-bold transition-all ${
                  movementMode === 'manual'
                    ? 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan shadow-md shadow-hud-cyan/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted'
                }`}
              >
                <span>👆</span>
                <span>Tap-to-Move (Pantalla)</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementMode('gps')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border font-mono text-xs font-bold transition-all ${
                  movementMode === 'gps'
                    ? 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan shadow-md shadow-hud-cyan/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted'
                }`}
              >
                <Navigation className="w-4 h-4" />
                <span>GPS Real en Vivo</span>
              </button>
            </div>
          </div>

          {/* SELECTOR DE VELOCIDAD DE DESPLAZAMIENTO (TAP-TO-MOVE) */}
          <div className="bg-hud-panel border border-hud-border p-3 rounded-xl flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <div className="flex items-center gap-1.5 text-hud-muted">
                <Gauge className="w-3.5 h-3.5 text-hud-cyan" />
                <span>Velocidad de Movimiento (Tap-to-Move):</span>
              </div>
              <span className="text-hud-cyan font-bold text-[11px]">
                {playerSpeed === 'slow' && '0.8 m/s (~3 km/h)'}
                {playerSpeed === 'normal' && '1.4 m/s (~5 km/h)'}
                {playerSpeed === 'fast' && '2.8 m/s (~10 km/h)'}
                {playerSpeed === 'very_fast' && '27.8 m/s (~100 km/h)'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPlayerSpeed('slow')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border font-mono text-xs transition-all ${
                  playerSpeed === 'slow'
                    ? 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan shadow-md shadow-hud-cyan/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted hover:border-hud-border/80'
                }`}
              >
                <span className="font-bold">Lento</span>
                <span className="text-[10px] opacity-75">3 km/h (Sigilo)</span>
              </button>

              <button
                type="button"
                onClick={() => setPlayerSpeed('normal')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border font-mono text-xs transition-all ${
                  playerSpeed === 'normal'
                    ? 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan shadow-md shadow-hud-cyan/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted hover:border-hud-border/80'
                }`}
              >
                <span className="font-bold">Normal</span>
                <span className="text-[10px] opacity-75">5 km/h (Paso)</span>
              </button>

              <button
                type="button"
                onClick={() => setPlayerSpeed('fast')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border font-mono text-xs transition-all ${
                  playerSpeed === 'fast'
                    ? 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan shadow-md shadow-hud-cyan/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted hover:border-hud-border/80'
                }`}
              >
                <span className="font-bold">Rápido</span>
                <span className="text-[10px] opacity-75">10 km/h (Trote)</span>
              </button>

              <button
                type="button"
                onClick={() => setPlayerSpeed('very_fast')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border font-mono text-xs transition-all ${
                  playerSpeed === 'very_fast'
                    ? 'border-hud-cyan bg-hud-cyan/15 text-hud-cyan shadow-md shadow-hud-cyan/20'
                    : 'border-hud-border bg-hud-dark text-hud-muted hover:border-hud-border/80'
                }`}
              >
                <span className="font-bold">Muy Rápido</span>
                <span className="text-[10px] opacity-75">100 km/h (Turbo)</span>
              </button>
            </div>
          </div>

          {/* UBICACIÓN CENTRAL */}
          <div className="flex flex-col gap-2 bg-hud-panel border border-hud-border px-3 py-2.5 rounded-xl text-xs font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-hud-muted">
                <MapPin className="w-4 h-4 text-hud-cyan" />
                <span className="font-bold text-slate-200">
                  {gpsObtained
                    ? `GPS fijado: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`
                    : isLoadingGps
                    ? 'Buscando satélites GPS...'
                    : 'Ubicación central de la partida'}
                </span>
              </div>
              <button
                type="button"
                onClick={fetchCurrentLocation}
                disabled={isLoadingGps}
                className="text-[11px] text-hud-cyan hover:underline flex items-center gap-1 font-bold disabled:opacity-50"
              >
                <Navigation className="w-3 h-3" />
                {isLoadingGps ? 'Buscando...' : 'Detectar mi GPS'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-hud-border/50">
              <div>
                <label className="text-[10px] text-hud-muted block">Latitud Centro</label>
                <input
                  type="number"
                  step="0.0001"
                  value={center.lat}
                  onChange={(e) =>
                    setCenter((prev) => ({
                      ...prev,
                      lat: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full bg-hud-dark border border-hud-border rounded px-2 py-1 text-xs font-mono text-hud-cyan focus:outline-none focus:border-hud-cyan"
                />
              </div>
              <div>
                <label className="text-[10px] text-hud-muted block">Longitud Centro</label>
                <input
                  type="number"
                  step="0.0001"
                  value={center.lng}
                  onChange={(e) =>
                    setCenter((prev) => ({
                      ...prev,
                      lng: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full bg-hud-dark border border-hud-border rounded px-2 py-1 text-xs font-mono text-hud-cyan focus:outline-none focus:border-hud-cyan"
                />
              </div>
            </div>
          </div>

          {/* ELECCIÓN DE CLASE / ROL */}
          <div>
            <label className="block text-xs font-mono text-hud-muted mb-2">
              Selecciona tu Clase de Combate
            </label>
            <RoleSelectorGrid selectedRole={role} onSelectRole={setRole} />
          </div>

          {/* BOTÓN CREAR */}
          <button
            type="submit"
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-hud-cyan to-teal-400 text-black font-mono font-black text-sm uppercase tracking-wider shadow-lg shadow-hud-cyan/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Crear Partida</span>
          </button>
        </form>
      </div>
    </div>
  );
};
