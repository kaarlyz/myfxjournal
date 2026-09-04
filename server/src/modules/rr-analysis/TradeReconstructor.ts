import { PlannedDataSource, ReplayAssumption, RiskAssumption, TradeReplayInput, TradeSide } from './types';

export class TradeReconstructor {
  private getSide(input: TradeReplayInput): TradeSide {
    return input.side === 'SHORT' ? 'SHORT' : 'LONG';
  }

  buildAssumption(input: TradeReplayInput): ReplayAssumption {
    const side = this.getSide(input);
    const entryPrice = input.entryPrice;
    const exitPrice = input.exitPrice;

    if (input.slPrice != null) {
      return this.fromManualSL(input, side, entryPrice, input.slPrice);
    }

    const riskDistance = Math.abs(exitPrice - entryPrice);

    if (input.result?.toUpperCase() === 'LOSS') {
      const virtualSL = exitPrice;
      const virtualTP = side === 'LONG' ? exitPrice + riskDistance : exitPrice - riskDistance;
      return {
        riskAssumption: 'FIXED_RR',
        plannedRR: 1,
        riskDistance,
        virtualSL,
        virtualTP,
        plannedDataSource: 'ASSUMED',
      };
    }

    const virtualSL = side === 'LONG' ? entryPrice - riskDistance : entryPrice + riskDistance;
    const virtualTP = exitPrice;
    return {
      riskAssumption: 'FIXED_RR',
      plannedRR: 1,
      riskDistance,
      virtualSL,
      virtualTP,
      plannedDataSource: 'ASSUMED',
    };
  }

  private fromManualSL(input: TradeReplayInput, side: TradeSide, entryPrice: number, slPrice: number): ReplayAssumption {
    const riskDistance = Math.abs(entryPrice - slPrice);
    const virtualTP = side === 'LONG' ? entryPrice + riskDistance : entryPrice - riskDistance;
    const normalizedRiskMode = input.riskMode?.toUpperCase();
    const riskAssumption: RiskAssumption = normalizedRiskMode === 'FIXED_SL'
      ? 'FIXED_SL'
      : normalizedRiskMode === 'FIXED_RR'
        ? 'FIXED_RR'
        : 'MANUAL';
    const plannedDataSource: PlannedDataSource = normalizedRiskMode === 'FIXED_SL'
      ? 'FIXED_SL'
      : normalizedRiskMode === 'FIXED_RR'
        ? 'ASSUMED'
        : 'MANUAL';

    return {
      riskAssumption,
      plannedRR: 1,
      riskDistance,
      virtualSL: slPrice,
      virtualTP,
      plannedDataSource,
    };
  }
}
