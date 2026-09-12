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
  onBack?: () => void;
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
  onBack,
}) => {
  const TFS: ChartTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  return (
    <div className="bg-white border-2 border-[#121212] px-3 py-1.5 select-none w-full min-w-0 max-w-full text-[#121212] shadow-[3px_3px_0px_0px_#121212]">
      <div className="flex flex-wrap items-center justify-between gap-2">

        {/* Left: Asset + Timeframe */}
        <div className="flex items-center gap-2 flex-wrap">
          {onBack && (
            <button
              onClick={onBack}
              title="Kembali"
              className="flex items-center justify-center p-1.5 bg-white border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] hover:bg-[#FFFDEB] text-[#121212] transition-colors mr-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
          <div className="flex items-center gap-1.5 bg-[#F0F0F0] border-2 border-[#121212] px-2.5 py-1 text-xs font-black shadow-[1px_1px_0px_0px_#121212]">
            <span className="text-[#1040C0] font-black">{symbol}</span>
            {(availableSymbols && availableSymbols.length > 0) ? (
              <select
                value={symbol}
                onChange={(e) => onSymbolChange?.(e.target.value)}
                aria-label="Pilih Instrumen Trading"
                className="bg-transparent text-[#121212] text-xs font-mono font-bold outline-hidden cursor-pointer"
              >
                {availableSymbols.map((s) => (
                  <option key={`${s.symbol}-${s.provider}`} value={s.symbol} className="bg-white text-[#121212]">
                    {s.symbol} ({s.provider})
                  </option>
                ))}
              </select>
            ) : (
              <>
                <span className="text-[#717182]">•</span>
                <span className="text-[10px] text-[#717182] font-mono font-bold">XAUUSD · EURUSD · NSXUSD</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 bg-[#F0F0F0] p-0.5 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
            {TFS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange?.(tf)}
                className={`px-2 py-0.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[#121212] text-white shadow-[1px_1px_0px_0px_#121212]'
                    : 'text-[#121212] hover:bg-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {appMode === 'analysis' && (
            <span className="text-[11px] font-black font-mono uppercase px-2 py-0.5 bg-[#E7F9F0] text-[#059669] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
              Analysis Mode
            </span>
          )}
          {appMode === 'selecting' && (
            <span className="text-[11px] font-black font-mono uppercase px-2 py-0.5 bg-[#FEF3C7] text-[#D97706] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] animate-pulse">
              Pilih Titik Awal
            </span>
          )}
          {appMode === 'replay' && (
            <span className="text-[11px] font-black font-mono uppercase px-2 py-0.5 bg-[#EBF2FF] text-[#1040C0] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
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
              className="flex items-center gap-1.5 px-3 h-8 bg-white hover:bg-[#FFFDEB] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-[#1040C0]" />
              <span className="hidden sm:inline">Jump</span>
            </button>
            <button
              onClick={onRandomStart}
              title="Random Start"
              className="flex items-center gap-1.5 px-3 h-8 bg-white hover:bg-[#FFFDEB] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5 text-[#D97706]" />
              <span className="hidden sm:inline">Random</span>
            </button>
            <button
              onClick={onActivateBarReplay}
              title="Aktifkan Chart Replay"
              className="flex items-center gap-1.5 px-3.5 h-8 bg-[#1040C0] hover:bg-[#0D3399] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Chart Replay</span>
            </button>
          </div>
        )}

        {appMode === 'selecting' && (
          <div className="flex items-center gap-2">
            {selectionTime && (
              <div className="flex items-center gap-1.5 text-[#D97706] text-xs font-mono font-bold bg-[#FEF3C7] px-2.5 py-1 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                <MousePointer2 className="w-3.5 h-3.5" />
                <span>{format(selectionTime, 'yyyy-MM-dd HH:mm')}</span>
              </div>
            )}
            <button
              onClick={onExitReplay}
              title="Batal"
              className="flex items-center gap-1.5 px-3 h-8 bg-[#FDECEC] hover:bg-[#DC2626] text-[#DC2626] hover:text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Batal</span>
            </button>
          </div>
        )}

        {appMode === 'replay' && (
          <div className="flex items-center justify-center gap-1.5">
            <div className="flex items-center gap-1.5 text-[#121212] text-xs font-mono bg-[#F0F0F0] px-2.5 py-1 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] mr-1">
              <Clock className="w-3.5 h-3.5 text-[#1040C0]" />
              <span className="font-bold">{replayTime ? format(replayTime, 'yyyy-MM-dd HH:mm') : '--:--'}</span>
              <span className="text-[#717182] text-[10px] font-bold">#{candleCount}</span>
            </div>

            <button
              onClick={onStepBack}
              disabled={loading || candleCount <= 1}
              title="Mundur 1 Candle (Left)"
              className="flex items-center justify-center w-8 h-8 bg-white hover:bg-[#FFFDEB] text-[#121212] disabled:opacity-30 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <button
              onClick={onPlayToggle}
              disabled={loading}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className={`flex items-center justify-center gap-1.5 px-3.5 h-8 font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-[#F59E0B] hover:bg-[#D97706] text-[#121212]'
                  : 'bg-[#059669] hover:bg-[#047857] text-white'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current stroke-[2.5]" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current stroke-[2.5]" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              onClick={onStepForward}
              disabled={loading}
              title="Maju 1 Candle (Right)"
              className="flex items-center justify-center w-8 h-8 bg-[#1040C0] hover:bg-[#0D3399] text-white disabled:opacity-30 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>

            <button
              onClick={onReset}
              disabled={loading}
              title="Reset ke Titik Awal"
              className="flex items-center justify-center w-8 h-8 bg-white hover:bg-[#FFFDEB] text-[#121212] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            <div className="flex items-center gap-0.5 ml-1 bg-[#F0F0F0] p-0.5 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
              {([1, 2, 5, 10] as ReplaySpeed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className={`px-2 py-0.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                    speed === s
                      ? 'bg-[#121212] text-white shadow-[1px_1px_0px_0px_#121212]'
                      : 'text-[#121212] hover:bg-white'
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
                className={`flex items-center gap-1 px-2.5 h-8 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase transition-all ml-1 cursor-pointer ${
                  followReplay
                    ? 'bg-[#EBF2FF] text-[#1040C0]'
                    : 'bg-white text-[#717182] hover:text-[#121212] hover:bg-[#FFFDEB]'
                }`}
              >
                <LocateFixed className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Follow</span>
              </button>
            )}

            {!followReplay && onJumpToCurrent && (
              <button
                onClick={onJumpToCurrent}
                title="Jump to Current Candle (J)"
                className="flex items-center gap-1 px-2.5 h-8 bg-[#FEF3C7] text-[#D97706] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase transition-all animate-pulse cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5 stroke-[2.5]" />
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
              className="flex items-center gap-1 px-2.5 h-8 bg-[#EBF2FF] hover:bg-[#D6E4FF] text-[#1040C0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase transition-all disabled:opacity-50 cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden md:inline">{isSyncingDashboard ? 'Syncing...' : 'Dashboard'}</span>
            </button>
          )}
          {appMode === 'replay' && (
            <button
              onClick={onExitReplay}
              title="Keluar dari Chart Replay"
              className="flex items-center gap-1.5 px-2.5 h-8 bg-[#FDECEC] hover:bg-[#DC2626] text-[#DC2626] hover:text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
          <button
            onClick={onToggleOrderPanel}
            title={isOrderPanelOpen ? 'Sembunyikan Order Panel' : 'Tampilkan Order Panel'}
            className={`w-8 h-8 flex items-center justify-center border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
              isOrderPanelOpen
                ? 'bg-[#1040C0] text-white'
                : 'bg-white text-[#121212] hover:bg-[#FFFDEB]'
            }`}
          >
            {isOrderPanelOpen ? <PanelRightClose className="w-4 h-4 stroke-[2.5]" /> : <PanelRightOpen className="w-4 h-4 stroke-[2.5]" />}
          </button>
          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F)'}
            className={`w-8 h-8 flex items-center justify-center border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
              isFullscreen
                ? 'bg-[#F59E0B] text-[#121212]'
                : 'bg-white text-[#121212] hover:bg-[#FFFDEB]'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 stroke-[2.5]" /> : <Maximize2 className="w-4 h-4 stroke-[2.5]" />}
          </button>
        </div>
      </div>
    </div>
  );
};
