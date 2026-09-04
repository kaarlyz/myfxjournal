import React from 'react';
import {
  Play, Pause, RotateCcw, Clock, ChevronLeft, ChevronRight,
  Calendar, Dices, Maximize2, Minimize2, PanelRightClose,
  PanelRightOpen, LocateFixed, Navigation, Video, X, MousePointer2,
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
  replayTime: Date | null;
  candleCount: number;
  followReplay?: boolean;
  onToggleFollowReplay?: () => void;
  onJumpToCurrent?: () => void;
  onOpenJumpDialog: () => void;
  onRandomStart: () => void;
  onActivateBarReplay: () => void;
  onExitReplay: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isOrderPanelOpen: boolean;
  onToggleOrderPanel: () => void;
  loading: boolean;
  selectionTime?: Date | null;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  appMode, isPlaying, onPlayToggle, onStepForward, onStepBack, onReset,
  speed, onSpeedChange, timeframe = 'M1', onTimeframeChange, replayTime,
  candleCount, followReplay = true, onToggleFollowReplay, onJumpToCurrent,
  onOpenJumpDialog, onRandomStart, onActivateBarReplay, onExitReplay,
  isFullscreen, onToggleFullscreen, isOrderPanelOpen, onToggleOrderPanel,
  loading, selectionTime,
}) => {
  const TFS: ChartTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-2 sm:px-3.5 sm:py-1.5 shadow-xl select-none w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">

        {/* Left: Asset + Timeframe */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg text-amber-300 font-bold text-xs">
            <span>XAUUSD</span>
            <span className="text-amber-500/60">•</span>
            <span className="text-[10px] bg-amber-400/20 px-1 py-0.5 rounded text-amber-200">DUKASCOPY</span>
          </div>
          <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {TFS.map((tf) => (
              <button key={tf} type="button" onClick={() => onTimeframeChange?.(tf)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${timeframe === tf ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>
                {tf}
              </button>
            ))}
          </div>
          {appMode === 'analysis' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">Analysis</span>}
          {appMode === 'selecting' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wide animate-pulse">Click a candle to set replay start</span>}
          {appMode === 'replay' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wide">Bar Replay</span>}
        </div>

        {/* Center: Mode Controls */}
        {appMode === 'analysis' && (
          <div className="flex items-center gap-2">
            <button onClick={onOpenJumpDialog} title="Jump ke Tanggal"
              className="flex items-center gap-1 px-2.5 h-8 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors">
              <Calendar className="w-3.5 h-3.5 text-blue-400" /><span className="hidden sm:inline">Jump</span>
            </button>
            <button onClick={onRandomStart} title="Random Start"
              className="flex items-center gap-1 px-2.5 h-8 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition-colors active:scale-95">
              <Dices className="w-3.5 h-3.5 text-amber-400" /><span className="hidden sm:inline">Random</span>
            </button>
            <button onClick={onActivateBarReplay} title="Aktifkan Bar Replay"
              className="flex items-center gap-1.5 px-3 h-8 bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-md shadow-blue-900/30">
              <Video className="w-3.5 h-3.5" /><span>Bar Replay</span>
            </button>
          </div>
        )}

        {appMode === 'selecting' && (
          <div className="flex items-center gap-2">
            {selectionTime && (
              <div className="flex items-center gap-1.5 text-amber-300 text-xs font-mono bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                <MousePointer2 className="w-3.5 h-3.5" />
                <span>{format(selectionTime, 'yyyy-MM-dd HH:mm')}</span>
              </div>
            )}
            <button onClick={onExitReplay} title="Batal"
              className="flex items-center gap-1.5 px-3 h-8 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-all active:scale-95">
              <X className="w-3.5 h-3.5" /><span>Cancel</span>
            </button>
          </div>
        )}

        {appMode === 'replay' && (
          <div className="flex items-center justify-center gap-1">
            <div className="flex items-center gap-1.5 text-slate-200 text-xs font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 mr-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold">{replayTime ? format(replayTime, 'yyyy-MM-dd HH:mm') : '--:--'}</span>
              <span className="text-slate-500 text-[10px]">#{candleCount}</span>
            </div>
            <button onClick={onStepBack} disabled={loading || candleCount <= 1} title="Mundur (Left)"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 disabled:opacity-40 border border-slate-700 active:scale-95 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={onPlayToggle} disabled={loading} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className={`flex items-center justify-center gap-1.5 px-3.5 h-8 rounded-lg font-bold text-xs transition-all active:scale-95 shadow-md ${isPlaying ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/50' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
              {isPlaying ? <><Pause className="w-3.5 h-3.5 fill-current" /><span>Pause</span></> : <><Play className="w-3.5 h-3.5 fill-current" /><span>Play</span></>}
            </button>
            <button onClick={onStepForward} disabled={loading} title="Step Forward (Right)"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 border border-blue-500/50 active:scale-95 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={onReset} disabled={loading} title="Reset Replay"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 border border-slate-700 active:scale-95 transition-all">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-0.5 ml-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              {([1, 2, 5, 10] as ReplaySpeed[]).map((s) => (
                <button key={s} onClick={() => onSpeedChange(s)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${speed === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  {s}x
                </button>
              ))}
            </div>
            {onToggleFollowReplay && (
              <button onClick={onToggleFollowReplay} title={followReplay ? 'Follow: ON' : 'Follow: OFF'}
                className={`flex items-center gap-1 px-2.5 h-8 rounded-lg border text-xs font-semibold transition-all active:scale-95 ml-1 ${followReplay ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'}`}>
                <LocateFixed className="w-3.5 h-3.5" /><span className="hidden sm:inline">Follow</span>
              </button>
            )}
            {!followReplay && onJumpToCurrent && (
              <button onClick={onJumpToCurrent} title="Jump to Live (J)"
                className="flex items-center gap-1 px-2 h-8 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all active:scale-95 animate-pulse">
                <Navigation className="w-3.5 h-3.5" /><span className="hidden sm:inline">Live</span>
              </button>
            )}
          </div>
        )}

        {/* Right: Utility buttons */}
        <div className="flex items-center gap-1.5 justify-end">
          {appMode === 'replay' && (
            <>
              <button onClick={onExitReplay} title="Exit Replay"
                className="flex items-center gap-1.5 px-2.5 h-8 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all active:scale-95">
                <X className="w-3.5 h-3.5" /><span className="hidden sm:inline">Exit Replay</span>
              </button>
              <button onClick={onToggleOrderPanel} title={isOrderPanelOpen ? 'Hide Orders' : 'Show Orders'}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${isOrderPanelOpen ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'}`}>
                {isOrderPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </button>
            </>
          )}
          <button onClick={onToggleFullscreen} title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F)'}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${isFullscreen ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}`}>
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
