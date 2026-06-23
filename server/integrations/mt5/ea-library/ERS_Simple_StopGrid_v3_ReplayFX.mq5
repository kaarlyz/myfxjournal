//+------------------------------------------------------------------+
//|                                      ERS_Simple_StopGrid_v3.mq5   |
//|             Simple Buy Stop / Sell Stop Grid with Sideways Filter |
//|                                                                  |
//|  Fitur utama:                                                    |
//|  - Pasang Buy Stop di atas harga dan Sell Stop di bawah harga    |
//|  - Default 11 level per sisi                                     |
//|  - Jarak tengah: jarak antara Buy Stop pertama dan Sell Stop awal |
//|  - Jarak grid: jarak antar level Buy/Sell berikutnya             |
//|  - Close all saat maksimal TP uang tercapai                      |
//|  - Close all saat maksimal floating loss tercapai                |
//|  - Jeda 10 detik, lalu setup ulang dari harga terbaru            |
//|  - Skip sideways sederhana memakai ATR                           |
//|  - Cleaner retry agar tidak ada pending buy/sell ketinggalan     |
//|  - GUI panel + tombol kontrol                                    |
//+------------------------------------------------------------------+
#property strict
#property version   "1.30"
#property description "ERS Simple Stop Grid v3: simplified parameters, ATR sideways skip, clean reset."

#include <Trade/Trade.mqh>
#include <ReplayFX_RemoteSDK.mqh>
CTrade trade;

//============================== INPUT SIMPLE ==============================//
input string InpEAName                  = "ERS Simple Stop Grid v3";
input long   InpMagic                   = 26061503;

// Core grid
input double InpLot                     = 0.01;
input int    InpLevelsPerSide           = 11;      // jumlah Buy Stop dan Sell Stop per sisi
input double InpMiddleGapPips           = 40.0;    // total jarak antara Buy Stop pertama dan Sell Stop pertama
input double InpGridStepPips            = 20.0;    // jarak antar masing-masing grid

// Core risk/exit
input double InpMaxTPMoney              = 1.50;    // kalau floating profit >= ini, close all
input double InpMaxFloatingLossMoney    = 5.00;    // kalau floating <= -ini, close all. 0 = mati
input int    InpRestartDelaySeconds     = 10;      // jeda setelah close all sebelum setup baru

// Sideways filter sederhana
input bool            InpSkipSideways   = true;
input ENUM_TIMEFRAMES InpSidewaysTF     = PERIOD_M5;
input int             InpATRPeriod      = 14;
input double          InpMinATRPips     = 25.0;    // ATR di bawah ini = sideways. 0 = filter mati

// Pip setting
input double InpPipInPoints             = 10.0;    // XAU umum: 10 point = 0.1 harga. Forex 5 digit: 10 point = 1 pip.

// Broker/safety teknis
input int    InpDeviationPoints         = 30;
input bool   InpUseBrokerMinDistance    = true;
input int    InpExtraStopBufferPoints   = 5;
input int    InpClearRetryAttempts      = 10;
input int    InpClearRetrySleepMs       = 200;

// Panel
input int    InpPanelX                  = 10;
input int    InpPanelY                  = 20;

input group "ReplayFX Remote"
input bool ReplayFX_Enable = true;
input string ReplayFX_BackendURL = "http://127.0.0.1:5000";
input string ReplayFX_SecretToken = "";
input string ReplayFX_TerminalId = "";
input string ReplayFX_InstanceId = "";
input ENUM_REPLAYFX_MODE ReplayFX_Mode = REPLAYFX_NOTIFY_ONLY;
input int ReplayFX_PollSeconds = 10;
input bool ReplayFX_TakeScreenshotOnSignal = true;
input bool ReplayFX_AllowRemoteConfig = true;

//============================== GLOBAL ==============================//
bool     g_enabled       = true;
bool     g_busy          = false;
datetime g_nextGridTime  = 0;
string   g_lastAction    = "EA loaded";
string   PFX             = "ERS_GRID_V3_";

int      g_atrHandle     = INVALID_HANDLE;
double   g_lastATRpips   = 0.0;
bool     g_lastSideways  = false;
double   g_lastActualGap = 0.0;
bool     g_showPanel      = true;
int      g_panelWidth     = 390;
bool     RuntimeInpSkipSideways = true;
int      RuntimeInpATRPeriod = 14;
int      RuntimeInpDeviationPoints = 30;
int      RuntimeInpPanelX = 10;
int      RuntimeInpPanelY = 20;

double EffLot() { return (ReplayFX_Enable && ReplayFXCfgLot > 0.0 ? ReplayFXCfgLot : InpLot); }
int EffLayers() { return (ReplayFX_Enable && ReplayFXCfgLayers > 0 ? ReplayFXCfgLayers : InpLevelsPerSide); }
double EffGridStepPips() { return (ReplayFX_Enable && ReplayFXCfgGridDistancePips > 0.0 ? ReplayFXCfgGridDistancePips : InpGridStepPips); }
double EffTargetProfit() { return (ReplayFX_Enable && ReplayFXCfgTargetProfit > 0.0 ? ReplayFXCfgTargetProfit : InpMaxTPMoney); }
double EffMaxFloatingLoss() { return (ReplayFX_Enable && ReplayFXCfgMaxFloatingLoss > 0.0 ? ReplayFXCfgMaxFloatingLoss : InpMaxFloatingLossMoney); }
bool EffSkipSideways() { return (ReplayFX_Enable && ReplayFXLastConfigAt > 0 ? ReplayFXCfgSkipSideways : RuntimeInpSkipSideways); }
int EffATRPeriod() { return (ReplayFX_Enable && ReplayFXCfgATRPeriod > 0 ? ReplayFXCfgATRPeriod : RuntimeInpATRPeriod); }
int EffDeviationPoints() { return (ReplayFX_Enable && ReplayFXCfgDeviationPoints > 0 ? ReplayFXCfgDeviationPoints : RuntimeInpDeviationPoints); }
int EffPanelX() { return (ReplayFX_Enable && ReplayFXCfgPanelX > 0 ? ReplayFXCfgPanelX : RuntimeInpPanelX); }
int EffPanelY() { return (ReplayFX_Enable && ReplayFXCfgPanelY > 0 ? ReplayFXCfgPanelY : RuntimeInpPanelY); }

void ERS_ApplyReplayFXConfig()
{
   if(!ReplayFX_Enable) return;
   bool oldPanel = g_showPanel;
   int oldPanelWidth = g_panelWidth;
   int oldPanelX = RuntimeInpPanelX;
   int oldPanelY = RuntimeInpPanelY;
   int oldAtrPeriod = RuntimeInpATRPeriod;
   int oldDeviation = RuntimeInpDeviationPoints;
   bool oldSkipSideways = RuntimeInpSkipSideways;

   g_showPanel = ReplayFXCfgShowPanel;
   if(ReplayFXPanelWidth > 0) g_panelWidth = ReplayFXPanelWidth;
   RuntimeInpSkipSideways = ReplayFXCfgSkipSideways;
   if(ReplayFXCfgATRPeriod > 0) RuntimeInpATRPeriod = ReplayFXCfgATRPeriod;
   if(ReplayFXCfgDeviationPoints > 0) RuntimeInpDeviationPoints = ReplayFXCfgDeviationPoints;
   if(ReplayFXCfgPanelX > 0) RuntimeInpPanelX = ReplayFXCfgPanelX;
   if(ReplayFXCfgPanelY > 0) RuntimeInpPanelY = ReplayFXCfgPanelY;
   trade.SetDeviationInPoints(EffDeviationPoints());
   if(oldAtrPeriod != RuntimeInpATRPeriod && g_atrHandle != INVALID_HANDLE)
   {
      IndicatorRelease(g_atrHandle);
      g_atrHandle = INVALID_HANDLE;
   }
   if(EffSkipSideways() && InpMinATRPips > 0.0 && g_atrHandle == INVALID_HANDLE)
      g_atrHandle = iATR(_Symbol, InpSidewaysTF, EffATRPeriod());
   if(oldPanel != g_showPanel || oldPanelWidth != g_panelWidth || oldPanelX != RuntimeInpPanelX || oldPanelY != RuntimeInpPanelY)
   {
      DeletePanel();
      BuildPanel();
      Print("ReplayFX GUI rebuild reason=config-change");
   }
   if(oldAtrPeriod != RuntimeInpATRPeriod) Print("ReplayFX config applied key=InpATRPeriod old=", oldAtrPeriod, " new=", RuntimeInpATRPeriod);
   if(oldDeviation != RuntimeInpDeviationPoints) Print("ReplayFX config applied key=InpDeviationPoints old=", oldDeviation, " new=", RuntimeInpDeviationPoints);
   if(oldSkipSideways != RuntimeInpSkipSideways) Print("ReplayFX config applied key=InpSkipSideways old=", (oldSkipSideways ? "true" : "false"), " new=", (RuntimeInpSkipSideways ? "true" : "false"));
   Print("ReplayFX config updated: lot=", DoubleToString(EffLot(), 2),
         " mode=", ReplayFX_ModeToString(ReplayFXMode),
         " gridDistancePips=", DoubleToString(EffGridStepPips(), 1),
         " layers=", IntegerToString(EffLayers()),
         " targetProfit=", DoubleToString(EffTargetProfit(), 2),
         " maxFloatingLoss=", DoubleToString(EffMaxFloatingLoss(), 2));
}

//============================== UTIL ================================//
double PointValue()
{
   return SymbolInfoDouble(_Symbol, SYMBOL_POINT);
}

double PipValue()
{
   return PointValue() * InpPipInPoints;
}

double NormalizePrice(double price)
{
   return NormalizeDouble(price, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
}

double NormalizeVolume(double volume)
{
   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   volume = MathMax(minLot, MathMin(maxLot, volume));
   if(stepLot > 0.0)
      volume = MathFloor(volume / stepLot) * stepLot;

   int volDigits = 2;
   if(stepLot > 0.0)
   {
      double tmp = stepLot;
      volDigits = 0;
      while(tmp < 1.0 && volDigits < 8)
      {
         tmp *= 10.0;
         volDigits++;
      }
   }

   return NormalizeDouble(volume, volDigits);
}

double SpreadPips()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return 0.0;

   double pip = PipValue();
   if(pip <= 0.0) return 0.0;
   return (tick.ask - tick.bid) / pip;
}

double BrokerMinDistancePrice()
{
   if(!InpUseBrokerMinDistance) return 0.0;

   int stopsLevel  = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   int freezeLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   int level       = MathMax(stopsLevel, freezeLevel) + InpExtraStopBufferPoints;

   return level * PointValue();
}

bool IsTradingAllowed()
{
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return false;
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED)) return false;

   long tradeMode = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE);
   if(tradeMode == SYMBOL_TRADE_MODE_DISABLED) return false;

   return true;
}

bool IsOurPositionSelected()
{
   if(PositionGetString(POSITION_SYMBOL) != _Symbol) return false;
   if((long)PositionGetInteger(POSITION_MAGIC) != InpMagic) return false;
   return true;
}

bool IsOurOrderSelected()
{
   if(OrderGetString(ORDER_SYMBOL) != _Symbol) return false;
   if((long)OrderGetInteger(ORDER_MAGIC) != InpMagic) return false;
   return true;
}

int CountOurPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(IsOurPositionSelected()) count++;
   }
   return count;
}

int CountOurOrdersByType(ENUM_ORDER_TYPE type)
{
   int count = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(!IsOurOrderSelected()) continue;
      if((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE) == type) count++;
   }
   return count;
}

int CountOurPendingOrders()
{
   int count = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(!IsOurOrderSelected()) continue;

      ENUM_ORDER_TYPE type = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(type == ORDER_TYPE_BUY_STOP || type == ORDER_TYPE_SELL_STOP) count++;
   }
   return count;
}

double OurFloatingProfit()
{
   double total = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!IsOurPositionSelected()) continue;

      total += PositionGetDouble(POSITION_PROFIT);
      total += PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

//=========================== SIDEWAYS FILTER ===========================//
bool ReadATR(double &atrPips)
{
   atrPips = 0.0;
   double pip = PipValue();
   if(pip <= 0.0) return false;

   if(g_atrHandle == INVALID_HANDLE)
      return false;

   double buffer[];
   ArraySetAsSeries(buffer, true);

   int copied = CopyBuffer(g_atrHandle, 0, 0, 3, buffer);
   if(copied <= 0)
      return false;

   atrPips = buffer[0] / pip;
   return true;
}

bool IsSidewaysNow()
{
   g_lastSideways = false;

   if(!EffSkipSideways()) return false;
   if(InpMinATRPips <= 0.0) return false;

   double atr = 0.0;
   if(!ReadATR(atr))
   {
      g_lastATRpips = 0.0;
      g_lastAction = "ATR not ready, grid blocked";
      g_lastSideways = true;
      return true;
   }

   g_lastATRpips = atr;
   if(atr < InpMinATRPips)
   {
      g_lastSideways = true;
      return true;
   }

   return false;
}

//=========================== CLEANER ===========================//
bool DeleteOurPendingOrdersOnce()
{
   bool ok = true;

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(!IsOurOrderSelected()) continue;

      ENUM_ORDER_TYPE type = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(type != ORDER_TYPE_BUY_STOP && type != ORDER_TYPE_SELL_STOP) continue;

      if(!trade.OrderDelete(ticket))
      {
         ok = false;
         Print("Failed delete pending #", ticket,
               " retcode=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      }
   }

   return ok;
}

bool CloseOurPositionsOnce()
{
   bool ok = true;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!IsOurPositionSelected()) continue;

      if(!trade.PositionClose(ticket))
      {
         ok = false;
         Print("Failed close position #", ticket,
               " retcode=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      }
   }

   return ok;
}

bool DeleteOurPendingOrdersClean(string reason)
{
   bool fullyClean = false;

   for(int attempt = 1; attempt <= MathMax(1, InpClearRetryAttempts); attempt++)
   {
      DeleteOurPendingOrdersOnce();

      int ord = CountOurPendingOrders();
      if(ord == 0)
      {
         fullyClean = true;
         break;
      }

      Print("Delete pending retry ", attempt, " / ", InpClearRetryAttempts,
            " reason=", reason, " remaining pending=", ord);

      Sleep(MathMax(0, InpClearRetrySleepMs));
   }

   if(!fullyClean)
      Print("WARNING: pending delete not fully clean. pending=", CountOurPendingOrders(),
            " reason=", reason);

   return fullyClean;
}

bool ClearAllOurTrades(string reason)
{
   bool fullyClean = false;

   for(int attempt = 1; attempt <= MathMax(1, InpClearRetryAttempts); attempt++)
   {
      // Tutup posisi dulu, lalu hapus pending. Kalau ada pending kena saat proses close,
      // retry berikutnya akan bereskan lagi.
      CloseOurPositionsOnce();
      DeleteOurPendingOrdersOnce();

      int pos = CountOurPositions();
      int ord = CountOurPendingOrders();

      if(pos == 0 && ord == 0)
      {
         fullyClean = true;
         break;
      }

      Print("Clear retry ", attempt, " / ", InpClearRetryAttempts,
            " reason=", reason, " remaining positions=", pos, " pending=", ord);

      Sleep(MathMax(0, InpClearRetrySleepMs));
   }

   if(!fullyClean)
      Print("WARNING: clear not fully clean. positions=", CountOurPositions(),
            " pending=", CountOurPendingOrders(), " reason=", reason);

   return fullyClean;
}

bool CloseAllAndScheduleReset(string reason)
{
   if(g_busy) return false;
   g_busy = true;

   g_lastAction = "Close all: " + reason;
   Print(g_lastAction);

   bool clean = ClearAllOurTrades(reason);
   if(clean)
   {
      g_nextGridTime = TimeCurrent() + MathMax(0, InpRestartDelaySeconds);
      g_lastAction = "Clean, wait " + IntegerToString(InpRestartDelaySeconds) + "s";
   }
   else
   {
      g_nextGridTime = 0;
      g_lastAction = "Not clean, check Journal";
   }

   g_busy = false;
   return clean;
}

//=========================== GRID ===========================//
bool PlaceGridCycle()
{
   if(g_busy) return false;
   if(!g_enabled)
   {
      g_lastAction = "EA paused, grid blocked";
      return false;
   }
   if(!IsTradingAllowed())
   {
      g_lastAction = "Trading not allowed";
      return false;
   }
   if(IsSidewaysNow())
   {
      g_lastAction = "Sideways skipped: ATR " + DoubleToString(g_lastATRpips, 1) + " pip";
      return false;
   }

   g_busy = true;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_lastAction = "No tick data";
      g_busy = false;
      return false;
   }

   double lot       = NormalizeVolume(EffLot());
   double pip       = PipValue();
   double step      = EffGridStepPips() * pip;
   double midGap    = InpMiddleGapPips * pip;
   double minDist   = BrokerMinDistancePrice();

   int levels = EffLayers();
   if(lot <= 0.0 || step <= 0.0 || midGap <= 0.0 || levels <= 0)
   {
      g_lastAction = "Bad input: lot/level/gap/step";
      g_busy = false;
      return false;
   }

   bool clean = ClearAllOurTrades("before new grid");
   if(!clean)
   {
      g_lastAction = "New grid blocked: old trades remain";
      g_busy = false;
      return false;
   }

   // Ambil harga terbaru setelah proses bersih-bersih.
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_lastAction = "No fresh tick after clean";
      g_busy = false;
      return false;
   }

   double base      = (tick.ask + tick.bid) / 2.0;
   double firstBuy  = base + (midGap / 2.0);
   double firstSell = base - (midGap / 2.0);

   // Pastikan tidak terlalu dekat dengan harga broker sekarang.
   firstBuy  = MathMax(firstBuy,  tick.ask + minDist);
   firstSell = MathMin(firstSell, tick.bid - minDist);

   g_lastActualGap = (firstBuy - firstSell) / pip;

   bool allOk = true;

   if(ReplayFX_Enable)
   {
      ReplayFXSignal signal;
      signal.eaName = InpEAName;
      signal.symbol = _Symbol;
      signal.timeframe = ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)_Period);
      signal.side = "GRID";
      signal.entry = base;
      signal.sl = 0.0;
      signal.tp = 0.0;
      signal.rr = 0.0;
      signal.riskPercent = 0.0;
      signal.lot = lot;
      signal.reason = "ERS stop-grid placement, levels per side=" + IntegerToString(levels);
      signal.timeoutSeconds = 300;
      if(!ReplayFX_RequestApproval(signal))
      {
         g_lastAction = "ReplayFX blocked/skipped grid: " + ReplayFX_ModeToString(ReplayFXMode);
         g_busy = false;
         return false;
      }
   }

   for(int level = 1; level <= levels; level++)
   {
      double buyPrice  = NormalizePrice(firstBuy  + (level - 1) * step);
      double sellPrice = NormalizePrice(firstSell - (level - 1) * step);

      string buyComment  = InpEAName + " BUY_STOP L" + IntegerToString(level);
      string sellComment = InpEAName + " SELL_STOP L" + IntegerToString(level);

      if((!ReplayFX_Enable || ReplayFXCfgAllowBuy) && !trade.BuyStop(lot, buyPrice, _Symbol, 0.0, 0.0, ORDER_TIME_GTC, 0, buyComment))
      {
         allOk = false;
         Print("BuyStop L", level, " failed at ", buyPrice,
               " retcode=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      }

      if((!ReplayFX_Enable || ReplayFXCfgAllowSell) && !trade.SellStop(lot, sellPrice, _Symbol, 0.0, 0.0, ORDER_TIME_GTC, 0, sellComment))
      {
         allOk = false;
         Print("SellStop L", level, " failed at ", sellPrice,
               " retcode=", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
      }
   }

   if(allOk)
      g_lastAction = "Grid placed from fresh price";
   else
      g_lastAction = "Grid placed with errors, check Journal";

   g_busy = false;
   return allOk;
}

//============================== GUI =================================//
void MakeRect(string name, int x, int y, int w, int h)
{
   string obj = PFX + name;
   if(ObjectFind(0, obj) < 0)
      ObjectCreate(0, obj, OBJ_RECTANGLE_LABEL, 0, 0, 0);

   ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, obj, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, obj, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, obj, OBJPROP_BGCOLOR, clrBlack);
   ObjectSetInteger(0, obj, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, obj, OBJPROP_COLOR, clrDimGray);
   ObjectSetInteger(0, obj, OBJPROP_BACK, false);
   ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, obj, OBJPROP_HIDDEN, true);
}

void MakeLabel(string name, string text, int x, int y, int size = 9, color clr = clrWhite)
{
   string obj = PFX + name;
   if(ObjectFind(0, obj) < 0)
      ObjectCreate(0, obj, OBJ_LABEL, 0, 0, 0);

   ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, obj, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, obj, OBJPROP_COLOR, clr);
   ObjectSetString(0, obj, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, obj, OBJPROP_TEXT, text);
   ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, obj, OBJPROP_HIDDEN, true);
}

void MakeButton(string name, string text, int x, int y, int w, int h)
{
   string obj = PFX + name;
   if(ObjectFind(0, obj) < 0)
      ObjectCreate(0, obj, OBJ_BUTTON, 0, 0, 0);

   ObjectSetInteger(0, obj, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, obj, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, obj, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, obj, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, obj, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, obj, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, obj, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, obj, OBJPROP_BGCOLOR, clrDimGray);
   ObjectSetString(0, obj, OBJPROP_FONT, "Arial");
   ObjectSetString(0, obj, OBJPROP_TEXT, text);
   ObjectSetInteger(0, obj, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, obj, OBJPROP_HIDDEN, true);
}

void BuildPanel()
{
   if(!g_showPanel) return;
   int x = EffPanelX();
   int y = EffPanelY();

   MakeRect("PANEL", x, y, g_panelWidth, 305);
   MakeLabel("TITLE", InpEAName, x + 10, y + 8, 10, clrAqua);

   for(int i = 0; i < 14; i++)
      MakeLabel("L" + IntegerToString(i), "", x + 10, y + 32 + i * 16, 9, clrWhite);

   MakeButton("BTN_TOGGLE", "PAUSE",        x + 10,  y + 260, 72,  24);
   MakeButton("BTN_RESET",  "RESET GRID",   x + 88,  y + 260, 90,  24);
   MakeButton("BTN_DELETE", "DEL PENDING",  x + 184, y + 260, 98,  24);
   MakeButton("BTN_CLOSE",  "CLOSE ALL",    x + 10,  y + 284, 272, 22);
}

void SetLabelText(int line, string text, color clr = clrWhite)
{
   string obj = PFX + "L" + IntegerToString(line);
   ObjectSetString(0, obj, OBJPROP_TEXT, text);
   ObjectSetInteger(0, obj, OBJPROP_COLOR, clr);
}

void UpdatePanel()
{
   if(!g_showPanel)
   {
      DeletePanel();
      return;
   }
   int buyStops  = CountOurOrdersByType(ORDER_TYPE_BUY_STOP);
   int sellStops = CountOurOrdersByType(ORDER_TYPE_SELL_STOP);
   int pendings  = buyStops + sellStops;
   int positions = CountOurPositions();
   double pnl    = OurFloatingProfit();

   string state = g_enabled ? "RUNNING" : "PAUSED";
   if(g_busy) state = "BUSY";
   if(g_lastSideways && g_enabled && positions == 0) state = "SIDEWAYS";

   int waitLeft = 0;
   if(g_nextGridTime > TimeCurrent())
      waitLeft = (int)(g_nextGridTime - TimeCurrent());

   ObjectSetString(0, PFX + "BTN_TOGGLE", OBJPROP_TEXT, g_enabled ? "PAUSE" : "START");

   SetLabelText(0,  "State       : " + state, g_busy ? clrYellow : (g_lastSideways ? clrOrange : (g_enabled ? clrLime : clrTomato)));
   SetLabelText(1,  "Symbol      : " + _Symbol + " | Magic " + IntegerToString((int)InpMagic));
   SetLabelText(2,  "Lot         : " + DoubleToString(NormalizeVolume(EffLot()), 2));
   SetLabelText(3,  "Grid        : " + IntegerToString(EffLayers()) + " x 2");
   SetLabelText(4,  "Middle gap  : set " + DoubleToString(InpMiddleGapPips, 1) + " | actual " + DoubleToString(g_lastActualGap, 1) + " pip");
   SetLabelText(5,  "Grid step   : " + DoubleToString(EffGridStepPips(), 1) + " pip");
   SetLabelText(6,  "Buy/Sell    : " + IntegerToString(buyStops) + " / " + IntegerToString(sellStops) + " | Pos " + IntegerToString(positions));
   SetLabelText(7,  "Pending     : " + IntegerToString(pendings) + " | Spread " + DoubleToString(SpreadPips(), 1) + " pip");
   SetLabelText(8,  "Float PnL   : " + DoubleToString(pnl, 2), pnl >= 0.0 ? clrLime : clrTomato);
   SetLabelText(9,  "Max TP      : " + DoubleToString(EffTargetProfit(), 2));
   SetLabelText(10, "Max Float   : -" + DoubleToString(EffMaxFloatingLoss(), 2));
   SetLabelText(11, "Sideways    : ATR " + DoubleToString(g_lastATRpips, 1) + " / min " + DoubleToString(InpMinATRPips, 1) + " pip", g_lastSideways ? clrOrange : clrLime);
   SetLabelText(12, "Restart     : " + IntegerToString(waitLeft) + "s");
   SetLabelText(13, "Last        : " + g_lastAction, clrSilver);

   ChartRedraw(0);
}

void DeletePanel()
{
   int total = ObjectsTotal(0, 0, -1);
   for(int i = total - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, PFX) == 0)
         ObjectDelete(0, name);
   }
}

//============================= EVENTS ===============================//
int OnInit()
{
   if(ReplayFX_Enable)
   {
      ReplayFXEAFileName = "ERS_Simple_StopGrid_v3_ReplayFX.mq5";
      ReplayFX_Init(ReplayFX_BackendURL, ReplayFX_SecretToken, ReplayFX_TerminalId, ReplayFX_InstanceId, InpEAName, ReplayFX_Mode, ReplayFX_PollSeconds, ReplayFX_TakeScreenshotOnSignal, 360, ReplayFX_AllowRemoteConfig);
      ReplayFX_SendHeartbeat("INIT");
      ReplayFX_LoadConfig();
      ERS_ApplyReplayFXConfig();
      EventSetTimer(MathMax(2, ReplayFX_PollSeconds));
   }

   trade.SetExpertMagicNumber(InpMagic);
   RuntimeInpSkipSideways = InpSkipSideways;
   RuntimeInpATRPeriod = InpATRPeriod;
   RuntimeInpDeviationPoints = InpDeviationPoints;
   RuntimeInpPanelX = InpPanelX;
   RuntimeInpPanelY = InpPanelY;
   ReplayFXCfgSkipSideways = InpSkipSideways;
   ReplayFXCfgATRPeriod = InpATRPeriod;
   ReplayFXCfgDeviationPoints = InpDeviationPoints;
   ReplayFXCfgPanelX = InpPanelX;
   ReplayFXCfgPanelY = InpPanelY;
   trade.SetDeviationInPoints(EffDeviationPoints());
   trade.SetAsyncMode(false);
   trade.SetTypeFillingBySymbol(_Symbol);

   if(EffSkipSideways() && InpMinATRPips > 0.0)
   {
      g_atrHandle = iATR(_Symbol, InpSidewaysTF, EffATRPeriod());
      if(g_atrHandle == INVALID_HANDLE)
      {
         Print("Failed to create ATR handle");
         return INIT_FAILED;
      }
   }

   g_enabled = true;
   g_nextGridTime = TimeCurrent();

   BuildPanel();
   UpdatePanel();

   if(CountOurPositions() == 0 && CountOurPendingOrders() == 0)
      PlaceGridCycle();

   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(ReplayFX_Enable) EventKillTimer();
   if(g_atrHandle != INVALID_HANDLE)
      IndicatorRelease(g_atrHandle);

   DeletePanel();
}

void OnTimer()
{
   if(!ReplayFX_Enable) return;
   ReplayFX_LoadConfig();
   ERS_ApplyReplayFXConfig();
   ReplayFX_SendHeartbeat("ONLINE");
}

void OnTick()
{
   UpdatePanel();

   if(g_busy) return;

   int positions = CountOurPositions();
   int pendings  = CountOurPendingOrders();
   double pnl    = OurFloatingProfit();

   // Proteksi dan TP tetap aktif walaupun EA dipause.
   if(positions > 0)
   {
      if(EffTargetProfit() > 0.0 && pnl >= EffTargetProfit())
      {
         CloseAllAndScheduleReset("max TP hit");
         UpdatePanel();
         return;
      }

      if(EffMaxFloatingLoss() > 0.0 && pnl <= -EffMaxFloatingLoss())
      {
         CloseAllAndScheduleReset("max floating loss hit");
         UpdatePanel();
         return;
      }

      return;
   }

   // Tidak ada posisi. Kalau sideways, jangan biarkan pending menggantung.
   if(IsSidewaysNow())
   {
      if(pendings > 0)
      {
         DeleteOurPendingOrdersClean("sideways idle cleanup");
         g_lastAction = "Sideways: pending deleted, wait trend";
      }
      UpdatePanel();
      return;
   }

   if(!g_enabled) return;
   if(!IsTradingAllowed())
   {
      g_lastAction = "Trading not allowed";
      return;
   }

   if(TimeCurrent() < g_nextGridTime)
      return;

   pendings = CountOurPendingOrders();

   if(pendings == 0)
   {
      PlaceGridCycle();
      UpdatePanel();
      return;
   }

   int expected = EffLayers() * 2;
   if(pendings != expected)
   {
      ClearAllOurTrades("broken idle grid rebuild");
      g_nextGridTime = TimeCurrent() + MathMax(0, InpRestartDelaySeconds);
      g_lastAction = "Broken grid cleaned, wait restart";
      UpdatePanel();
      return;
   }
}

void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(id != CHARTEVENT_OBJECT_CLICK) return;

   if(sparam == PFX + "BTN_TOGGLE")
   {
      g_enabled = !g_enabled;
      g_lastAction = g_enabled ? "EA started from panel" : "EA paused from panel";
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   }
   else if(sparam == PFX + "BTN_RESET")
   {
      if(CountOurPositions() > 0)
      {
         CloseAllAndScheduleReset("manual reset with open position");
      }
      else
      {
         ClearAllOurTrades("manual reset");
         g_nextGridTime = TimeCurrent() + MathMax(0, InpRestartDelaySeconds);
         g_lastAction = "Manual reset, wait restart";
      }
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   }
   else if(sparam == PFX + "BTN_DELETE")
   {
      DeleteOurPendingOrdersClean("manual delete pending");
      g_lastAction = "Pending orders deleted";
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   }
   else if(sparam == PFX + "BTN_CLOSE")
   {
      CloseAllAndScheduleReset("manual close all");
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   }

   UpdatePanel();
}
//+------------------------------------------------------------------+
