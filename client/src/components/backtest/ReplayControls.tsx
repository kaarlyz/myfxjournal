import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Dices,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  LocateFixed,
  Navigation,
  Video,
  X,
  MousePointer2,
  LayoutDashboard,
} from 'lucide-react';
import { format } from 'date-fns';

export type ReplaySpeed = 1 | 2 | 5 | 10;
export type ChartTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';
export type AppMode = 'analysis' | 'selecting' | 'replay';

interface ReplayControlsProps {
  appMode: AppMode;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  speed: ReplaySpeed;
  onSpeedChange: (speed: ReplaySpeed) => void;
  timeframe?: ChartTimeframe;
  onTimeframeChange?: (tf: ChartTimeframe) => void;
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
  availableSymbols?: Array<{ symbol: string; provider: string; candleCount: number }>;
  replayTime: Date | null;
  candleCount: number;
  followReplay?: boolean;
  onToggleFollowReplay?: () => void;
  onJumpToCurrent?: () => void;
  onOpenJumpDialog: () => void;
  onRandomStart: () => void;
  onActivateBarReplay: () => void;
  onExitReplay: () => void;
  onOpenDashboard?: () => void;
  isSyncingDashboard?: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isOrderPanelOpen: boolean;
  onToggleOrderPanel: () => void;
  loading: boolean;
  selectionTime?: Date | null;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  appMode,
  isPlaying,
  onPlayToggle,
  onStepForward,
  onStepBack,
  onReset,
  speed,
  onSpeedChange,
  timeframe = 'M1',
  onTimeframeChange,
  symbol = 'XAUUSD',
  onSymbolChange,
  availableSymbols,
  replayTime,
  candleCount,
  followReplay = true,
  onToggleFollowReplay,
  onJumpToCurrent,
  onOpenJumpDialog,
  onRandomStart,
  onActivateBarReplay,
  onExitReplay,
  onOpenDashboard,
  isSyncingDashboard = false,
  isFullscreen,
  onToggleFullscreen,
  isOrderPanelOpen,
  onToggleOrderPanel,
  loading,
  selectionTime,
}) => {
  const TFS: ChartTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  return (
    <div className="bg-[#121622] border border-slate-800 rounded-lg px-3 py-1.5 select-none w-full min-w-0 max-w-full text-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">

        {/* Left: Asset + Timeframe */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded px-2.5 py-1 text-xs font-semibold tracking-tight">
            <span className="text-amber-400 font-bold">{symbol}</span>
            {(availableSymbols && availableSymbols.length > 0) ? (
              <select
                value={symbol}
                onChange={(e) => onSymbolChange?.(e.target.value)}
                aria-label="Pilih Instrumen Trading"
                className="bg-transparent text-slate-300 text-xs font-mono outline-hidden cursor-pointer"
              >
                {availableSymbols.map((s) => (
                  <option key={`${s.symbol}-${s.provider}`} value={s.symbol} className="bg-slate-900 text-slate-200">
                    {s.symbol} ({s.provider})
                  </option>
                ))}
              </select>
            ) : (
              <>
                <span className="text-slate-500">•</span>
                <span className="text-[10px] text-slate-400 font-mono">XAUUSD · EURUSD · NSXUSD</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 bg-slate-900/90 p-0.5 border border-slate-800 rounded">
            {TFS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange?.(tf)}
                className={`px-2 py-0.5 text-xs font-mono font-medium rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {appMode === 'analysis' && (
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
              Analysis Mode
            </span>
          )}
          {appMode === 'selecting' && (
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded animate-pulse">
              Pilih Candle Titik Awal
            </span>
          )}
            {appMode === 'replay' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded">
                Chart Replay
              </span>
            )}

        </div>

        {/* Center: Mode Controls */}
        {appMode === 'analysis' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenJumpDialog}
              title="Jump ke Tanggal"
              className="flex items-center gap-1.5 px-3 h-8 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-medium transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Jump</span>
            </button>
            <button
              onClick={onRandomStart}
              title="Random Start"
              className="flex items-center gap-1.5 px-3 h-8 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-medium transition-colors"
            >
              <Dices className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Random</span>
            </button>
            <button
              onClick={onActivateBarReplay}
              title="Aktifkan Chart Replay"
              className="flex items-center gap-1.5 px-3.5 h-8 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold uppercase tracking-wider transition-colors shadow-xs"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Chart Replay</span>
            </button>
          </div>
        )}

        {appMode === 'selecting' && (
          <div className="flex items-center gap-2">
            {selectionTime && (
              <div className="flex items-center gap-1.5 text-amber-300 text-xs font-mono font-semibold bg-amber-500/10 px-2.5 py-1 border border-amber-500/20 rounded">
                <MousePointer2 className="w-3.5 h-3.5" />
                <span>{format(selectionTime, 'yyyy-MM-dd HH:mm')}</span>
              </div>
            )}
            <button
              onClick={onExitReplay}
              title="Batal"
              className="flex items-center gap-1.5 px-3 h-8 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded text-xs font-semibold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Batal</span>
            </button>
          </div>
        )}

        {appMode === 'replay' && (
          <div className="flex items-center justify-center gap-1.5">
            <div className="flex items-center gap-1.5 text-slate-200 text-xs font-mono bg-slate-900/90 px-2.5 py-1 border border-slate-800 rounded mr-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold">{replayTime ? format(replayTime, 'yyyy-MM-dd HH:mm') : '--:--'}</span>
              <span className="text-slate-500 text-[10px]">#{candleCount}</span>
            </div>

            <button
              onClick={onStepBack}
              disabled={loading || candleCount <= 1}
              title="Mundur 1 Candle (Left)"
              className="flex items-center justify-center w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 border border-slate-700 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={onPlayToggle}
              disabled={loading}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className={`flex items-center justify-center gap-1.5 px-3.5 h-8 font-bold text-xs uppercase tracking-wider rounded transition-colors shadow-xs ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              onClick={onStepForward}
              disabled={loading}
              title="Maju 1 Candle (Right)"
              className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={onReset}
              disabled={loading}
              title="Reset ke Titik Awal"
              className="flex items-center justify-center w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-0.5 ml-1 bg-slate-900/90 p-0.5 border border-slate-800 rounded">
              {([1, 2, 5, 10] as ReplaySpeed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className={`px-2 py-0.5 text-xs font-mono font-medium rounded transition-colors ${
                    speed === s
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {onToggleFollowReplay && (
              <button
                onClick={onToggleFollowReplay}
                title={followReplay ? 'Follow Replay: ON' : 'Follow Replay: OFF'}
                className={`flex items-center gap-1 px-2.5 h-8 border rounded text-xs font-medium transition-colors ml-1 ${
                  followReplay
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Follow</span>
              </button>
            )}

            {!followReplay && onJumpToCurrent && (
              <button
                onClick={onJumpToCurrent}
                title="Jump to Current Candle (J)"
                className="flex items-center gap-1 px-2.5 h-8 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-semibold transition-colors animate-pulse"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Live</span>
              </button>
            )}
          </div>
        )}

        {/* Right: Utility buttons */}
        <div className="flex items-center gap-1.5 justify-end">
          {appMode === 'replay' && onOpenDashboard && (
            <button
              onClick={onOpenDashboard}
              disabled={isSyncingDashboard}
              title="Sinkronkan & Buka di Dashboard"
              className="flex items-center gap-1 px-2.5 h-8 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{isSyncingDashboard ? 'Syncing...' : 'Dashboard'}</span>
            </button>
          )}
          {appMode === 'replay' && (
            <button
              onClick={onExitReplay}
              title="Keluar dari Chart Replay"

              className="flex items-center gap-1.5 px-2.5 h-8 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded text-xs font-semibold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
          <button
            onClick={onToggleOrderPanel}
            title={isOrderPanelOpen ? 'Sembunyikan Order Panel' : 'Tampilkan Order Panel'}
            className={`w-8 h-8 flex items-center justify-center border rounded transition-colors ${
              isOrderPanelOpen
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {isOrderPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F)'}
            className={`w-8 h-8 flex items-center justify-center border rounded transition-colors ${
              isFullscreen
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
