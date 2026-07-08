//+------------------------------------------------------------------+
//|                                             CRT_CandleRangeTheory_EA.mq5 |
//|  Candle Range Theory / CRT EA                                     |
//|  Logic: Candle 2 sweeps Candle 1 high/low, then closes back inside |
//|  Candle 1 range. Entry is reversal, SL at Candle 2 wick, TP by RR. |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "CRT EA: range TF M15/H1/H4, execution TF M1/M5/M15, GUI stats, range drawing."

#include <Trade/Trade.mqh>
#include <ReplayFX_RemoteSDK.mqh>

CTrade trade;

enum ENUM_CRT_PAIR_MODE
{
   CRT_M15_TO_M1 = 0,
   CRT_H1_TO_M5  = 1,
   CRT_H4_TO_M15 = 2,
   CRT_CUSTOM    = 3
};

enum ENUM_BOTH_SWEEP_MODE
{
   BOTH_SWEEP_SKIP = 0,
   BOTH_SWEEP_CANDLE_DIRECTION = 1
};

//=========================== INPUTS =================================
input ENUM_CRT_PAIR_MODE InpPairMode       = CRT_M15_TO_M1; // Pair CRT TF
input ENUM_TIMEFRAMES    InpCustomRangeTF  = PERIOD_M15;    // Custom range TF
input ENUM_TIMEFRAMES    InpCustomExecTF   = PERIOD_M1;      // Custom execution TF

input bool   InpUseRiskPercent             = true;           // Lot pakai risk %
input double InpRiskPercent                = 1.0;            // Risk % per trade
input double InpFixedLot                   = 0.01;           // Fixed lot kalau risk % off
input bool   InpAllowMinLotWhenRiskTooSmall= true;           // Pakai min lot kalau hasil risk < min lot
input double InpRR                         = 2.0;            // Risk Reward, contoh 2 = 1:2
input int    InpSLBufferPoints             = 50;             // Buffer SL dari wick candle 2, points
input int    InpMaxSpreadPoints            = 300;            // Max spread points, 0 = off
input int    InpMaxEntryDistancePoints     = 1500;           // Max jarak entry dari close candle 2, 0 = off
input int    InpDeviationPoints            = 30;             // Deviation points
input int    InpMaxPositions               = 1;              // Max posisi EA di simbol ini
input long   InpMagic                      = 20260618;       // Magic number

input bool   InpWaitExecTFNewBar           = true;           // Entry di open bar baru execution TF
input int    InpMaxSignalExecutionBars     = 3;              // Sinyal expired setelah N percobaan exec bar
input ENUM_BOTH_SWEEP_MODE InpBothSweepMode= BOTH_SWEEP_SKIP;// Kalau candle 2 sweep high & low

input bool   InpUseTradingHours            = false;          // Filter jam server broker
input int    InpStartHour                  = 0;              // Jam mulai server
input int    InpEndHour                    = 23;             // Jam akhir server

input bool   InpDrawRanges                 = true;           // Gambar range candle 1
input bool   InpDrawMidLine                = true;           // Gambar midline range
input int    InpLineExtendBars             = 6;              // Panjang garis ke kanan dalam jumlah candle range TF
input int    InpMaxDrawnRanges             = 80;             // Maks range yang disimpan di chart

input bool   InpShowPanel                  = true;           // Tampilkan GUI panel
input int    InpPanelUpdateSec             = 1;              // Update panel per detik

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

//=========================== GLOBALS ================================
ENUM_TIMEFRAMES g_rangeTF = PERIOD_M15;
ENUM_TIMEFRAMES g_execTF  = PERIOD_M1;

datetime g_lastRangeBarTime = 0;
datetime g_lastExecBarTime  = 0;

int      g_pendingDir       = 0;       // 1 buy, -1 sell, 0 none
datetime g_pendingC1Time    = 0;
datetime g_pendingC2Time    = 0;
datetime g_pendingReadyTime = 0;
double   g_pendingSL        = 0.0;
double   g_pendingC2Close   = 0.0;
int      g_pendingAttempts  = 0;
string   g_lastSignal       = "None";
string   g_status           = "Starting";

bool     g_paused           = false;
string   g_rangeBases[];

string   PFX;

//=========================== UTILS ==================================
string TFToString(ENUM_TIMEFRAMES tf)
{
   switch(tf)
   {
      case PERIOD_M1:  return "M1";
      case PERIOD_M2:  return "M2";
      case PERIOD_M3:  return "M3";
      case PERIOD_M4:  return "M4";
      case PERIOD_M5:  return "M5";
      case PERIOD_M6:  return "M6";
      case PERIOD_M10: return "M10";
      case PERIOD_M12: return "M12";
      case PERIOD_M15: return "M15";
      case PERIOD_M20: return "M20";
      case PERIOD_M30: return "M30";
      case PERIOD_H1:  return "H1";
      case PERIOD_H2:  return "H2";
      case PERIOD_H3:  return "H3";
      case PERIOD_H4:  return "H4";
      case PERIOD_H6:  return "H6";
      case PERIOD_H8:  return "H8";
      case PERIOD_H12: return "H12";
      case PERIOD_D1:  return "D1";
      case PERIOD_W1:  return "W1";
      case PERIOD_MN1: return "MN1";
      default:         return EnumToString(tf);
   }
}

void SelectTimeframes()
{
   if(InpPairMode == CRT_M15_TO_M1)
   {
      g_rangeTF = PERIOD_M15;
      g_execTF  = PERIOD_M1;
   }
   else if(InpPairMode == CRT_H1_TO_M5)
   {
      g_rangeTF = PERIOD_H1;
      g_execTF  = PERIOD_M5;
   }
   else if(InpPairMode == CRT_H4_TO_M15)
   {
      g_rangeTF = PERIOD_H4;
      g_execTF  = PERIOD_M15;
   }
   else
   {
      g_rangeTF = InpCustomRangeTF;
      g_execTF  = InpCustomExecTF;
   }
}

bool IsNewBar(ENUM_TIMEFRAMES tf, datetime &last_time)
{
   datetime t = iTime(_Symbol, tf, 0);
   if(t <= 0)
      return false;

   if(last_time == 0)
   {
      last_time = t;
      return false;
   }

   if(t != last_time)
   {
      last_time = t;
      return true;
   }
   return false;
}

int SpreadPoints()
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask <= 0 || bid <= 0)
      return 0;
   return (int)MathRound((ask - bid) / _Point);
}

bool IsTradingHour()
{
   if(!InpUseTradingHours)
      return true;

   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);

   if(InpStartHour <= InpEndHour)
      return (dt.hour >= InpStartHour && dt.hour <= InpEndHour);

   // untuk sesi melewati tengah malam, contoh 22 sampai 3
   return (dt.hour >= InpStartHour || dt.hour <= InpEndHour);
}

int VolumeDigitsByStep(double step)
{
   int digits = 0;
   double x = step;
   while(digits < 8 && MathAbs(x - MathRound(x)) > 0.0000001)
   {
      x *= 10.0;
      digits++;
   }
   return digits;
}

double NormalizeVolumeBySymbol(double vol)
{
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   if(step <= 0.0)
      step = 0.01;

   vol = MathMin(maxLot, vol);

   if(vol < minLot)
   {
      if(InpAllowMinLotWhenRiskTooSmall)
         vol = minLot;
      else
         return 0.0;
   }

   double steps = MathFloor((vol - minLot) / step + 0.0000001);
   vol = minLot + steps * step;
   vol = MathMax(minLot, MathMin(maxLot, vol));

   return NormalizeDouble(vol, VolumeDigitsByStep(step));
}

bool CalculateRiskLot(int dir, double entry, double sl, double &lot, string &why)
{
   if(!InpUseRiskPercent)
   {
      lot = NormalizeVolumeBySymbol(InpFixedLot);
      if(lot <= 0.0)
      {
         why = "Fixed lot di bawah minimum broker";
         return false;
      }
      return true;
   }

   double effectiveRiskPercent = (ReplayFX_Enable && ReplayFXCfgRiskPercent > 0.0 ? ReplayFXCfgRiskPercent : InpRiskPercent);
   if(effectiveRiskPercent <= 0.0)
   {
      why = "Risk percent harus > 0";
      return false;
   }

   ENUM_ORDER_TYPE type = (dir == 1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   double profitAtSL = 0.0;

   if(!OrderCalcProfit(type, _Symbol, 1.0, entry, sl, profitAtSL))
   {
      why = "OrderCalcProfit gagal: " + IntegerToString(GetLastError());
      return false;
   }

   double riskPerLot = MathAbs(profitAtSL);
   if(riskPerLot <= 0.0)
   {
      why = "Risk per 1 lot tidak valid";
      return false;
   }

   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = balance * effectiveRiskPercent / 100.0;
   double rawLot    = riskMoney / riskPerLot;

   lot = NormalizeVolumeBySymbol(rawLot);
   if(lot <= 0.0)
   {
      why = "Lot hasil risk terlalu kecil untuk minimum broker";
      return false;
   }
   return true;
}

int CountOurPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
      {
         count++;
      }
   }
   return count;
}

double FloatingProfitOurPositions()
{
   double total = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
      {
         total += PositionGetDouble(POSITION_PROFIT);
         total += PositionGetDouble(POSITION_SWAP);
      }
   }
   return total;
}

void CloseAllOurPositions()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;

      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
      {
         trade.PositionClose(ticket);
      }
   }
}

bool RetcodeOK(uint ret)
{
   return (ret == TRADE_RETCODE_DONE ||
           ret == TRADE_RETCODE_DONE_PARTIAL ||
           ret == TRADE_RETCODE_PLACED);
}

//=========================== DRAWING ================================
void DeleteRangeBase(string base)
{
   ObjectDelete(0, base + "_HIGH");
   ObjectDelete(0, base + "_LOW");
   ObjectDelete(0, base + "_MID");
   ObjectDelete(0, base + "_TXT");
}

void RememberRangeBase(string base)
{
   int n = ArraySize(g_rangeBases);
   ArrayResize(g_rangeBases, n + 1);
   g_rangeBases[n] = base;

   while(ArraySize(g_rangeBases) > InpMaxDrawnRanges)
   {
      string oldest = g_rangeBases[0];
      DeleteRangeBase(oldest);

      int size = ArraySize(g_rangeBases);
      for(int i = 1; i < size; i++)
         g_rangeBases[i - 1] = g_rangeBases[i];
      ArrayResize(g_rangeBases, size - 1);
   }
}

void MakeTrendLine(string name, datetime t1, double p1, datetime t2, double p2, color clr, int width, ENUM_LINE_STYLE style)
{
   ObjectDelete(0, name);
   if(!ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2))
      return;

   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void DrawRange(const MqlRates &c1, const MqlRates &c2, int dir)
{
   if(!InpDrawRanges)
      return;

   int sec = PeriodSeconds(g_rangeTF);
   if(sec <= 0)
      sec = 60;

   datetime t1 = c1.time;
   datetime t2 = c2.time + sec * MathMax(1, InpLineExtendBars);
   string base = PFX + "R_" + IntegerToString((long)c1.time);

   color clr = clrSilver;
   if(dir == 1)  clr = clrLimeGreen;
   if(dir == -1) clr = clrTomato;

   MakeTrendLine(base + "_HIGH", t1, c1.high, t2, c1.high, clr, 1, STYLE_SOLID);
   MakeTrendLine(base + "_LOW",  t1, c1.low,  t2, c1.low,  clr, 1, STYLE_SOLID);

   if(InpDrawMidLine)
   {
      double mid = (c1.high + c1.low) / 2.0;
      MakeTrendLine(base + "_MID", t1, mid, t2, mid, clrGray, 1, STYLE_DOT);
   }

   ObjectDelete(0, base + "_TXT");
   if(ObjectCreate(0, base + "_TXT", OBJ_TEXT, 0, c2.time, c1.high))
   {
      string txt = (dir == 1 ? "CRT BUY" : (dir == -1 ? "CRT SELL" : "CRT RANGE"));
      ObjectSetString(0, base + "_TXT", OBJPROP_TEXT, txt);
      ObjectSetInteger(0, base + "_TXT", OBJPROP_COLOR, clr);
      ObjectSetInteger(0, base + "_TXT", OBJPROP_FONTSIZE, 8);
      ObjectSetInteger(0, base + "_TXT", OBJPROP_SELECTABLE, false);
   }

   RememberRangeBase(base);
}

void DeleteObjectsByPrefix(string prefix)
{
   for(int i = ObjectsTotal(0, -1, -1) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, -1, -1);
      if(StringFind(name, prefix) == 0)
         ObjectDelete(0, name);
   }
}

//=========================== PANEL ==================================
void CreateLabel(string name, int x, int y, string text, int fontSize, color clr)
{
   ObjectDelete(0, name);
   if(!ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0))
      return;

   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void CreateButton(string name, int x, int y, int w, int h, string text)
{
   ObjectDelete(0, name);
   if(!ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0))
      return;

   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void InitPanel()
{
   if(!InpShowPanel)
      return;

   ObjectDelete(0, PFX + "PANEL_BG");
   if(ObjectCreate(0, PFX + "PANEL_BG", OBJ_RECTANGLE_LABEL, 0, 0, 0))
   {
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_XDISTANCE, 8);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_YDISTANCE, 18);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_XSIZE, 360);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_YSIZE, 260);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_BGCOLOR, clrBlack);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_COLOR, clrDimGray);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_BACK, false);
      ObjectSetInteger(0, PFX + "PANEL_BG", OBJPROP_SELECTABLE, false);
   }

   for(int i = 0; i < 14; i++)
      CreateLabel(PFX + "LBL_" + IntegerToString(i), 18, 28 + i * 15, "", 8, clrWhite);

   CreateButton(PFX + "BTN_PAUSE", 18, 238, 90, 24, "PAUSE");
   CreateButton(PFX + "BTN_CLOSE", 118, 238, 90, 24, "CLOSE ALL");
}

void SetLabel(int idx, string text, color clr = clrWhite)
{
   string name = PFX + "LBL_" + IntegerToString(idx);
   if(ObjectFind(0, name) < 0)
      return;
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
}

datetime DayStartServer()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0;
   dt.min  = 0;
   dt.sec  = 0;
   return StructToTime(dt);
}

void GetDealStats(datetime fromTime, int &trades, int &wins, int &losses, double &netProfit)
{
   trades = 0;
   wins = 0;
   losses = 0;
   netProfit = 0.0;

   if(!HistorySelect(fromTime, TimeCurrent()))
      return;

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;

      string sym = HistoryDealGetString(deal, DEAL_SYMBOL);
      long magic = HistoryDealGetInteger(deal, DEAL_MAGIC);
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);

      if(sym != _Symbol || magic != InpMagic)
         continue;

      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT && entry != DEAL_ENTRY_OUT_BY)
         continue;

      double p = HistoryDealGetDouble(deal, DEAL_PROFIT) +
                 HistoryDealGetDouble(deal, DEAL_SWAP) +
                 HistoryDealGetDouble(deal, DEAL_COMMISSION);

      if(MathAbs(p) < 0.0000001)
         continue;

      trades++;
      netProfit += p;
      if(p > 0.0) wins++;
      else        losses++;
   }
}

string FormatMoney(double v)
{
   return DoubleToString(v, 2);
}

void UpdatePanel()
{
   if(!InpShowPanel)
      return;

   int allTrades, allWins, allLosses;
   double allProfit;
   GetDealStats(0, allTrades, allWins, allLosses, allProfit);

   int dayTrades, dayWins, dayLosses;
   double dayProfit;
   GetDealStats(DayStartServer(), dayTrades, dayWins, dayLosses, dayProfit);

   double allWR = (allTrades > 0 ? (double)allWins * 100.0 / allTrades : 0.0);
   double dayWR = (dayTrades > 0 ? (double)dayWins * 100.0 / dayTrades : 0.0);

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   double fm  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double flt = FloatingProfitOurPositions();
   double dd  = (bal > 0.0 ? (bal - eq) / bal * 100.0 : 0.0);
   if(dd < 0.0) dd = 0.0;

   SetLabel(0,  "CRT Candle Range Theory EA", clrGold);
   SetLabel(1,  "Symbol       : " + _Symbol + " | Magic " + IntegerToString((int)InpMagic));
   SetLabel(2,  "Mode         : Range " + TFToString(g_rangeTF) + " -> Exec " + TFToString(g_execTF));
   SetLabel(3,  "Status       : " + (g_paused ? "PAUSED" : g_status), g_paused ? clrTomato : clrWhite);
   SetLabel(4,  "Last Signal  : " + g_lastSignal);
   SetLabel(5,  "Spread       : " + IntegerToString(SpreadPoints()) + " pts | Max " + IntegerToString(InpMaxSpreadPoints));
   SetLabel(6,  "Balance      : " + FormatMoney(bal) + " | Equity " + FormatMoney(eq));
   SetLabel(7,  "Free Margin  : " + FormatMoney(fm) + " | DD " + DoubleToString(dd, 2) + "%");
   SetLabel(8,  "Floating EA  : " + FormatMoney(flt), flt >= 0.0 ? clrLimeGreen : clrTomato);
   SetLabel(9,  "Today WR     : " + DoubleToString(dayWR, 1) + "% | " + IntegerToString(dayWins) + "W/" + IntegerToString(dayLosses) + "L | Net " + FormatMoney(dayProfit));
   SetLabel(10, "All WR       : " + DoubleToString(allWR, 1) + "% | " + IntegerToString(allWins) + "W/" + IntegerToString(allLosses) + "L | Net " + FormatMoney(allProfit));
   SetLabel(11, "Risk/RR      : " + (InpUseRiskPercent ? DoubleToString(InpRiskPercent, 2) + "%" : "Lot " + DoubleToString(InpFixedLot, 2)) + " | RR 1:" + DoubleToString(InpRR, 2));
   SetLabel(12, "Positions    : " + IntegerToString(CountOurPositions()) + "/" + IntegerToString(InpMaxPositions));
   SetLabel(13, "Pending      : " + (g_pendingDir == 1 ? "BUY" : (g_pendingDir == -1 ? "SELL" : "None")) + " | Attempts " + IntegerToString(g_pendingAttempts));

   if(ObjectFind(0, PFX + "BTN_PAUSE") >= 0)
      ObjectSetString(0, PFX + "BTN_PAUSE", OBJPROP_TEXT, g_paused ? "RUN" : "PAUSE");
}

//=========================== STRATEGY ================================
int DetectCRTSignal(const MqlRates &c1, const MqlRates &c2)
{
   bool closeInside = (c2.close <= c1.high && c2.close >= c1.low);
   if(!closeInside)
      return 0;

   bool sweepHigh = (c2.high > c1.high);
   bool sweepLow  = (c2.low  < c1.low);

   if(sweepLow && !sweepHigh)
      return 1;   // sweep low lalu close balik ke range = buy

   if(sweepHigh && !sweepLow)
      return -1;  // sweep high lalu close balik ke range = sell

   if(sweepHigh && sweepLow)
   {
      if(InpBothSweepMode == BOTH_SWEEP_CANDLE_DIRECTION)
      {
         if(c2.close > c2.open) return 1;
         if(c2.close < c2.open) return -1;
      }
      return 0;
   }

   return 0;
}

void EvaluateClosedRangeBar()
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);

   int copied = CopyRates(_Symbol, g_rangeTF, 0, 4, rates);
   if(copied < 3)
   {
      g_status = "Data range TF belum cukup";
      return;
   }

   MqlRates c2 = rates[1]; // candle yang baru close
   MqlRates c1 = rates[2]; // candle range pembanding

   int dir = DetectCRTSignal(c1, c2);
   DrawRange(c1, c2, dir);

   if(dir == 0)
   {
      g_lastSignal = TimeToString(c2.time, TIME_DATE|TIME_MINUTES) + " | No valid CRT";
      g_status = "Menunggu sweep + close inside";
      return;
   }

   double sl = 0.0;
   if(dir == 1)
      sl = c2.low - InpSLBufferPoints * _Point;
   else
      sl = c2.high + InpSLBufferPoints * _Point;

   sl = NormalizeDouble(sl, _Digits);

   g_pendingDir       = dir;
   g_pendingC1Time    = c1.time;
   g_pendingC2Time    = c2.time;
   g_pendingReadyTime = rates[0].time; // open candle baru range TF
   g_pendingSL        = sl;
   g_pendingC2Close   = c2.close;
   g_pendingAttempts  = 0;

   g_lastSignal = TimeToString(c2.time, TIME_DATE|TIME_MINUTES) + (dir == 1 ? " | BUY" : " | SELL");
   g_status = "CRT signal valid, menunggu execution TF";
}

void ClearPending(string reason)
{
   g_pendingDir = 0;
   g_pendingSL = 0.0;
   g_pendingC2Close = 0.0;
   g_pendingAttempts = 0;
   g_status = reason;
}

void TryExecutePending()
{
   if(g_pendingDir == 0)
      return;

   g_pendingAttempts++;
   if(g_pendingAttempts > MathMax(1, InpMaxSignalExecutionBars))
   {
      ClearPending("Sinyal expired");
      return;
   }

   if(g_paused)
   {
      g_status = "EA pause, sinyal ditahan";
      return;
   }

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      g_status = "AutoTrading tidak aktif";
      return;
   }

   if(!IsTradingHour())
   {
      g_status = "Di luar jam trading";
      return;
   }

   int effectiveMaxSpread = (ReplayFX_Enable && ReplayFXCfgMaxSpread > 0.0 ? (int)ReplayFXCfgMaxSpread : InpMaxSpreadPoints);
   if(effectiveMaxSpread > 0 && SpreadPoints() > effectiveMaxSpread)
   {
      g_status = "Spread terlalu besar";
      return;
   }

   if(CountOurPositions() >= InpMaxPositions)
   {
      g_status = "Max posisi tercapai";
      return;
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask <= 0.0 || bid <= 0.0)
   {
      g_status = "Harga ask/bid tidak valid";
      return;
   }

   int dir = g_pendingDir;
   double entry = (dir == 1 ? ask : bid);
   double sl = g_pendingSL;

   if(InpMaxEntryDistancePoints > 0)
   {
      double dist = MathAbs(entry - g_pendingC2Close) / _Point;
      if(dist > InpMaxEntryDistancePoints)
      {
         ClearPending("Harga sudah terlalu jauh dari close candle 2");
         return;
      }
   }

   if(dir == 1 && sl >= entry)
   {
      ClearPending("SL buy tidak valid");
      return;
   }
   if(dir == -1 && sl <= entry)
   {
      ClearPending("SL sell tidak valid");
      return;
   }

   int stopsLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double slDistancePoints = MathAbs(entry - sl) / _Point;
   if(stopsLevel > 0 && slDistancePoints <= stopsLevel + 2)
   {
      ClearPending("SL terlalu dekat dengan harga / stop level broker");
      return;
   }

   double riskDist = MathAbs(entry - sl);
   double effectiveRR = (ReplayFX_Enable && ReplayFXCfgRR > 0.0 ? ReplayFXCfgRR : InpRR);
   double tp = 0.0;
   if(dir == 1)
      tp = entry + riskDist * effectiveRR;
   else
      tp = entry - riskDist * effectiveRR;

   sl = NormalizeDouble(sl, _Digits);
   tp = NormalizeDouble(tp, _Digits);

   double lot = 0.0;
   string why = "";
   if(!CalculateRiskLot(dir, entry, sl, lot, why))
   {
      ClearPending(why);
      return;
   }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviationPoints);

   bool sent = false;
   string comment = "CRT " + TFToString(g_rangeTF) + "->" + TFToString(g_execTF);

   if(ReplayFX_Enable)
   {
      ReplayFXSignal signal;
      signal.eaName = "CRT Candle Range Theory";
      signal.symbol = _Symbol;
      signal.timeframe = TFToString(g_execTF);
      signal.side = (dir == 1 ? "BUY" : "SELL");
      signal.entry = entry;
      signal.sl = sl;
      signal.tp = tp;
      signal.rr = (ReplayFXCfgRR > 0.0 ? ReplayFXCfgRR : InpRR);
      signal.riskPercent = (ReplayFXCfgRiskPercent > 0.0 ? ReplayFXCfgRiskPercent : InpRiskPercent);
      signal.lot = lot;
      signal.reason = "CRT sweep reversal " + TFToString(g_rangeTF) + " -> " + TFToString(g_execTF);
      signal.timeoutSeconds = 300;
      if(!ReplayFX_RequestApproval(signal))
      {
         g_status = "ReplayFX blocked/skipped entry: " + ReplayFX_ModeToString(ReplayFXMode);
         return;
      }
   }

   if(dir == 1)
      sent = trade.Buy(lot, _Symbol, 0.0, sl, tp, comment + " BUY");
   else
      sent = trade.Sell(lot, _Symbol, 0.0, sl, tp, comment + " SELL");

   uint ret = trade.ResultRetcode();
   if(sent && RetcodeOK(ret))
   {
      g_status = "ENTRY OK: " + (dir == 1 ? "BUY" : "SELL") + " lot " + DoubleToString(lot, 2);
      g_pendingDir = 0;
      g_pendingAttempts = 0;
      return;
   }

   g_status = "Entry gagal retcode " + IntegerToString((int)ret) + " | " + trade.ResultRetcodeDescription();
}

//=========================== EVENTS =================================
int OnInit()
{
   PFX = "CRT_EA_" + _Symbol + "_" + IntegerToString((int)InpMagic) + "_";
   SelectTimeframes();
   if(ReplayFX_Enable)
   {
      ReplayFXEAFileName = "CRT_CandleRangeTheory_EA_ReplayFX.mq5";
      ReplayFX_Init(ReplayFX_BackendURL, ReplayFX_SecretToken, ReplayFX_TerminalId, ReplayFX_InstanceId, "CRT Candle Range Theory", ReplayFX_Mode, ReplayFX_PollSeconds, ReplayFX_TakeScreenshotOnSignal, 360, ReplayFX_AllowRemoteConfig);
      ReplayFX_SendHeartbeat("INIT");
      ReplayFX_LoadConfig();
   }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviationPoints);

   g_lastRangeBarTime = iTime(_Symbol, g_rangeTF, 0);
   g_lastExecBarTime  = iTime(_Symbol, g_execTF, 0);

   InitPanel();
   EventSetTimer(MathMax(1, InpPanelUpdateSec));

   g_status = "Ready";
   UpdatePanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   // Hapus panel saja, range sengaja dibiarkan agar masih bisa dilihat setelah EA dilepas.
   ObjectDelete(0, PFX + "PANEL_BG");
   for(int i = 0; i < 20; i++)
      ObjectDelete(0, PFX + "LBL_" + IntegerToString(i));
   ObjectDelete(0, PFX + "BTN_PAUSE");
   ObjectDelete(0, PFX + "BTN_CLOSE");
}

void OnTick()
{
   if(IsNewBar(g_rangeTF, g_lastRangeBarTime))
      EvaluateClosedRangeBar();

   if(g_pendingDir != 0)
   {
      if(InpWaitExecTFNewBar)
      {
         if(IsNewBar(g_execTF, g_lastExecBarTime))
            TryExecutePending();
      }
      else
      {
         TryExecutePending();
      }
   }

   if(InpShowPanel)
      UpdatePanel();
}

void OnTimer()
{
   if(ReplayFX_Enable)
   {
      ReplayFX_LoadConfig();
      ReplayFX_SendHeartbeat("ONLINE");
   }
   UpdatePanel();
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id != CHARTEVENT_OBJECT_CLICK)
      return;

   if(sparam == PFX + "BTN_PAUSE")
   {
      g_paused = !g_paused;
      g_status = (g_paused ? "Paused by button" : "Running");
      UpdatePanel();
   }
   else if(sparam == PFX + "BTN_CLOSE")
   {
      CloseAllOurPositions();
      g_status = "Close all requested";
      UpdatePanel();
   }
}
//+------------------------------------------------------------------+
