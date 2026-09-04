import test from 'node:test';
import assert from 'node:assert/strict';
import { TradeReconstructor } from '../TradeReconstructor';

test('reconstructs assumed 1R for winning long trade', () => {
  const reconstructor = new TradeReconstructor();
  const assumption = reconstructor.buildAssumption({
    tradeId: 't1',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryPrice: 2000,
    exitPrice: 2050,
    entryTime: new Date('2026-08-01T10:00:00.000Z'),
    exitTime: new Date('2026-08-01T11:00:00.000Z'),
    result: 'WIN',
  });

  assert.equal(assumption.riskAssumption, 'FIXED_RR');
  assert.equal(assumption.plannedRR, 1);
  assert.equal(assumption.riskDistance, 50);
  assert.equal(assumption.virtualSL, 1950);
  assert.equal(assumption.virtualTP, 2050);
  assert.equal(assumption.plannedDataSource, 'ASSUMED');
});

test('uses fixed SL mode when provided', () => {
  const reconstructor = new TradeReconstructor();
  const assumption = reconstructor.buildAssumption({
    tradeId: 't2',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryPrice: 2000,
    exitPrice: 1980,
    entryTime: new Date('2026-08-01T10:00:00.000Z'),
    exitTime: new Date('2026-08-01T11:00:00.000Z'),
    result: 'LOSS',
    slPrice: 1950,
    riskMode: 'FIXED_SL',
  });

  assert.equal(assumption.riskAssumption, 'FIXED_SL');
  assert.equal(assumption.virtualSL, 1950);
  assert.equal(assumption.riskDistance, 50);
  assert.equal(assumption.plannedDataSource, 'FIXED_SL');
});

test('uses manual SL metadata when no explicit risk mode is provided', () => {
  const reconstructor = new TradeReconstructor();
  const assumption = reconstructor.buildAssumption({
    tradeId: 't3',
    symbol: 'XAUUSD',
    side: 'SHORT',
    entryPrice: 2010,
    exitPrice: 1990,
    entryTime: new Date('2026-08-01T10:00:00.000Z'),
    exitTime: new Date('2026-08-01T11:00:00.000Z'),
    result: 'LOSS',
    slPrice: 2020,
  });

  assert.equal(assumption.riskAssumption, 'MANUAL');
  assert.equal(assumption.virtualSL, 2020);
  assert.equal(assumption.plannedDataSource, 'MANUAL');
});
