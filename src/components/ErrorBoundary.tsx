import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      copied: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error capturado por ErrorBoundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleCopy = () => {
    const errorDetails = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}`;
    navigator.clipboard.writeText(errorDetails);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('monster_hunt_anon_id');
      sessionStorage.clear();
    } catch {
      // Ignorar
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-[#080c10] text-slate-100 flex flex-col justify-between p-6 sm:p-10 font-mono select-none overflow-y-auto">
          {/* LÍNEAS TÁCTICAS HUD DE FONDO */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ff005515_1px,transparent_1px),linear-gradient(to_bottom,#ff005515_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />

          {/* CABECERA */}
          <div className="relative z-10 flex items-center justify-between border-b border-red-500/40 pb-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
              <span className="text-sm font-black tracking-widest uppercase">
                PROTOCOLO DE EMERGENCIA // ERROR DE SISTEMA
              </span>
            </div>
            <span className="text-xs text-hud-muted">CÓDIGO: EX_CRASH</span>
          </div>

          {/* CUERPO CENTRAL */}
          <div className="relative z-10 max-w-xl mx-auto w-full my-auto flex flex-col gap-5 py-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-red-400 uppercase tracking-wide">
                Fallo Crítico en el Sistema
              </h1>
              <p className="text-xs sm:text-sm text-slate-300">
                Se ha producido una excepción no controlada en la aplicación. Revisa el informe diagnóstico a continuación.
              </p>
            </div>

            {/* DETALLES DEL ERROR */}
            <div className="bg-[#0d131a] border border-red-500/50 rounded-xl p-4 flex flex-col gap-2 shadow-2xl">
              <div className="flex items-center justify-between text-xs text-red-300 font-bold border-b border-red-500/20 pb-2">
                <span>INFORME DE EXCEPCIÓN:</span>
                <button
                  onClick={this.handleCopy}
                  className="flex items-center gap-1 text-[11px] text-hud-muted hover:text-white px-2 py-0.5 rounded bg-black/40 border border-hud-border transition-all"
                >
                  {this.state.copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar error</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-xs text-red-200/90 max-h-40 overflow-y-auto font-mono bg-black/50 p-2.5 rounded border border-red-900/40 whitespace-pre-wrap break-words">
                {this.state.error?.message || 'Error desconocido al inicializar componentes.'}
              </div>

              {this.state.error?.stack && (
                <details className="text-[10px] text-hud-muted">
                  <summary className="cursor-pointer hover:text-slate-300 py-1">
                    Ver traza completa de la pila (Stack Trace)
                  </summary>
                  <pre className="p-2 bg-black/60 rounded max-h-32 overflow-y-auto whitespace-pre-wrap mt-1">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            {/* LISTA DE COMPROBACIONES TÉCNICAS */}
            <div className="bg-[#121a24] border border-hud-border p-3.5 rounded-xl text-xs flex flex-col gap-2">
              <span className="font-bold text-hud-cyan uppercase tracking-wider">
                Verificaciones recomendadas:
              </span>
              <ul className="list-disc list-inside text-slate-300 space-y-1 text-[11px]">
                <li>
                  <strong>Variables de Entorno:</strong> Verifica en <em>Vercel Settings &gt; Environment Variables</em> que <code className="text-hud-amber">VITE_SUPABASE_URL</code> y <code className="text-hud-amber">VITE_SUPABASE_ANON_KEY</code> estén configuradas.
                </li>
                <li>
                  <strong>WebGL:</strong> Comprueba que la aceleración por hardware de gráficos esté activa en tu navegador para MapLibre GL.
                </li>
                <li>
                  <strong>Geolocalización:</strong> Asegúrate de permitir el acceso a la ubicación si juegas en modo GPS.
                </li>
              </ul>
            </div>

            {/* BOTONES DE RECUPERACIÓN */}
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reintentar Ejecución</span>
              </button>

              <button
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 rounded-xl bg-hud-panel border border-hud-border hover:border-hud-cyan text-hud-muted hover:text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
              >
                <span>Limpiar Caché y Volver al Inicio</span>
              </button>
            </div>
          </div>

          {/* PIE DE PÁGINA */}
          <div className="relative z-10 text-center text-[10px] text-hud-muted">
            Las Meriendas: Monster Hunt • Diagnóstico Táctico de Recuperación
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
