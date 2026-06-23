//+------------------------------------------------------------------+
//| BreakoutRR_DebugEA_v2_00.mq5                                      |
//| Eka x ChatGPT                                                     |
//| FIXED from scratch: simple breakout RR 1:2 + robust order engine   |
//| Purpose: if no entry, GUI tells EXACT blocking reason/retcode.     |
//+------------------------------------------------------------------+
#property strict
#property version "2.00"

#include <Trade/Trade.mqh>
#include <ReplayFX_RemoteSDK.mqh>
CTrade trade;

//==================================================================
// ENUMS
//==================================================================
enum PIP_MODE
{
   PIP_AUTO   = 0,
   PIP_POINT  = 1,
   PIP_CUSTOM = 2
};

enum ENTRY_MODE
{
   ENTRY_BREAK_CURRENT = 0, // every tick: ask/bid breaks previous range
   ENTRY_BREAK_CLOSE   = 1, // new bar: closed candle closes beyond range
   ENTRY_FORCE_TEST    = 2  // force 1 test entry to prove broker/order engine
};

enum SL_MODE
{
   SL_MANUAL = 0,
   SL_RANGE  = 1
};

//==================================================================
// INPUTS
//==================================================================
input group "01. SYMBOL"
input string          InpSymbol              = "";          // kosong = chart symbol. Untuk kamu: XAUUSD-ECN
input PIP_MODE        InpPipMode             = PIP_CUSTOM;  // default CUSTOM untuk XAU broker beda-beda
input double          InpCustomPipSize       = 0.01;        // XAU biasanya 0.01
input bool            InpAutoSelectSymbol    = true;

input group "02. STRATEGY"
input long            InpMagic               = 20260614;
input ENUM_TIMEFRAMES InpTF                  = PERIOD_M5;
input ENTRY_MODE      InpEntryMode           = ENTRY_BREAK_CURRENT;
input int             InpLookback            = 10;
input double          InpBreakBufferPips     = 0.0;
input bool            InpAllowBuy            = true;
input bool            InpAllowSell           = true;
input bool            InpOnePositionOnly     = true;
input bool            InpOneEntryPerBar      = true;

input group "03. RR"
input SL_MODE         InpSLMode              = SL_MANUAL;
input double          InpManualSLPips        = 100.0;
input double          InpRangeSLBufferPips   = 10.0;
input double          InpRR                  = 2.0;         // RR 1:2
input double          InpMinSLPips           = 20.0;
input double          InpMaxSLPips           = 1000.0;

input group "04. LOT"
input bool            InpUseFixedLot         = true;
input double          InpFixedLot            = 0.01;
input double          InpRiskPercent         = 0.50;

input group "05. FILTER"
input bool            InpUseSpreadFilter     = false;       // default OFF dulu
input double          InpMaxSpreadPips       = 3.0;

input group "06. ORDER ENGINE DEBUG"
input bool            InpOpenWithoutSLTPThenModify = true;  // avoids invalid stops on entry
input bool            InpTryAllFillingModes         = true; // retries FOK/IOC/RETURN
input int             InpDeviationPoints            = 200;
input int             InpMaxRetryPerTick            = 1;
input bool            InpVerboseLog                 = true;

input group "07. GUI"
input bool            InpShowGUI             = true;
input int             InpPanelX              = 10;
input int             InpPanelY              = 28;
input int             InpPanelRefreshSec     = 1;

input group "08. REPLAYFX REMOTE"
input bool ReplayFX_Enable = true;
input string ReplayFX_BackendURL = "http://127.0.0.1:5000";
input string ReplayFX_SecretToken = "";
input string ReplayFX_TerminalId = "";
input string ReplayFX_InstanceId = "";
input ENUM_REPLAYFX_MODE ReplayFX_Mode = REPLAYFX_NOTIFY_ONLY;
input int ReplayFX_PollSeconds = 10;
input bool ReplayFX_TakeScreenshotOnSignal = true;
input bool ReplayFX_AllowRemoteConfig = true;

//==================================================================
// GLOBALS
//==================================================================
string PFX="BRKDBG_";
string S="";
int    Dig=0;
double PointSize=0.0, Pip=0.0, TickSize=0.0, TickValue=0.0;
double VolMin=0.0, VolMax=0.0, VolStep=0.0;
long   TradeMode=0, FillMask=0;

datetime lastBar=0;
datetime lastEntryBar=0;
datetime lastPanel=0;

string state="INIT";
string reason="--";
string lastErrorText="--";
string lastRequest="--";
string lastSignal="--";
string lastExec="--";
string lastModify="--";

double rangeHigh=0.0, rangeLow=0.0, signalClose=0.0;
int lastDir=0;

double lastCloseNet=0.0, lastComm=0.0;
int tradeTotal=0,wins=0,losses=0;
double gp=0.0, gl=0.0;

double R_RR() { return (ReplayFX_Enable && ReplayFXCfgRR > 0.0 ? ReplayFXCfgRR : InpRR); }
double R_RiskPercent() { return (ReplayFX_Enable && ReplayFXCfgRiskPercent > 0.0 ? ReplayFXCfgRiskPercent : InpRiskPercent); }
bool R_AllowBuy() { return (ReplayFX_Enable && ReplayFXLastConfigAt > 0 ? ReplayFXCfgAllowBuy : InpAllowBuy); }
bool R_AllowSell() { return (ReplayFX_Enable && ReplayFXLastConfigAt > 0 ? ReplayFXCfgAllowSell : InpAllowSell); }
bool R_UseSpreadFilter() { return (ReplayFX_Enable && ReplayFXLastConfigAt > 0 ? ReplayFXCfgUseSpreadFilter : InpUseSpreadFilter); }
double R_MaxSpreadPips() { return (ReplayFX_Enable && ReplayFXCfgMaxSpread > 0.0 ? ReplayFXCfgMaxSpread : InpMaxSpreadPips); }
int R_Lookback() { return (ReplayFX_Enable && ReplayFXCfgLookback > 0 ? ReplayFXCfgLookback : InpLookback); }
double R_BreakBufferPips() { return (ReplayFX_Enable && ReplayFXCfgBreakBufferPips > 0.0 ? ReplayFXCfgBreakBufferPips : InpBreakBufferPips); }
double R_ManualSLPips() { return (ReplayFX_Enable && ReplayFXCfgManualSLPips > 0.0 ? ReplayFXCfgManualSLPips : InpManualSLPips); }
bool R_OnePositionOnly() { return (ReplayFX_Enable && ReplayFXLastConfigAt > 0 ? ReplayFXCfgOnePositionOnly : InpOnePositionOnly); }
bool R_OneEntryPerBar() { return (ReplayFX_Enable && ReplayFXLastConfigAt > 0 ? ReplayFXCfgOneEntryPerBar : InpOneEntryPerBar); }

ENTRY_MODE R_EntryMode()
{
   if(!ReplayFX_Enable || ReplayFXCfgEntryMode == "") return InpEntryMode;
   string mode = ReplayFXCfgEntryMode;
   StringToUpper(mode);
   if(mode == "ENTRY_BREAK_CLOSE" || mode == "BREAK_CLOSE" || mode == "CLOSE") return ENTRY_BREAK_CLOSE;
   if(mode == "ENTRY_FORCE_TEST" || mode == "FORCE_TEST" || mode == "TEST") return ENTRY_FORCE_TEST;
   return ENTRY_BREAK_CURRENT;
}

//==================================================================
// BASIC
//==================================================================
void Log(string s){ if(InpVerboseLog) Print(s); }

double NPrice(double p)
{
   if(TickSize>0) p = MathRound(p / TickSize) * TickSize;
   return NormalizeDouble(p, Dig);
}

double ToPip(double dist){ return Pip>0 ? dist/Pip : 0.0; }
double P2P(double pips){ return pips*Pip; }

string Trim(string x)
{
   StringTrimLeft(x);
   StringTrimRight(x);
   return x;
}

bool InitSymbol()
{
   S = Trim(InpSymbol);
   if(S=="") S = _Symbol;

   if(InpAutoSelectSymbol)
      SymbolSelect(S, true);

   if(!SymbolInfoInteger(S, SYMBOL_EXIST))
   {
      reason = "SYMBOL NOT EXIST: " + S;
      Print("[INIT FAIL] ", reason);
      return false;
   }

   Dig       = (int)SymbolInfoInteger(S, SYMBOL_DIGITS);
   PointSize     = SymbolInfoDouble(S, SYMBOL_POINT);
   TickSize  = SymbolInfoDouble(S, SYMBOL_TRADE_TICK_SIZE);
   TickValue = SymbolInfoDouble(S, SYMBOL_TRADE_TICK_VALUE);
   VolMin    = SymbolInfoDouble(S, SYMBOL_VOLUME_MIN);
   VolMax    = SymbolInfoDouble(S, SYMBOL_VOLUME_MAX);
   VolStep   = SymbolInfoDouble(S, SYMBOL_VOLUME_STEP);
   TradeMode = SymbolInfoInteger(S, SYMBOL_TRADE_MODE);
   FillMask  = SymbolInfoInteger(S, SYMBOL_FILLING_MODE);

   if(PointSize<=0)
   {
      reason = "POINT invalid. Symbol not loaded: " + S;
      return false;
   }

   if(TickSize<=0) TickSize=PointSize;
   if(VolStep<=0) VolStep=0.01;

   if(InpPipMode==PIP_CUSTOM) Pip=InpCustomPipSize;
   else if(InpPipMode==PIP_POINT) Pip=PointSize;
   else
   {
      if(Dig==5 || Dig==3) Pip=PointSize*10.0;
      else Pip=PointSize;
   }

   if(Pip<=0) Pip=PointSize;

   MqlTick t;
   if(!SymbolInfoTick(S,t))
   {
      reason="NO TICK. Open chart/tester on symbol: "+S;
      return false;
   }

   return true;
}

bool Tick(MqlTick &t)
{
   if(!SymbolInfoTick(S,t))
   {
      reason="NO TICK from "+S;
      return false;
   }
   if(t.bid<=0 || t.ask<=0)
   {
      reason="BAD TICK bid/ask zero";
      return false;
   }
   return true;
}

double SpreadPips()
{
   MqlTick t;
   if(!Tick(t)) return 999999.0;
   return ToPip(t.ask-t.bid);
}

double StopLevelPrice()
{
   double stops=(double)SymbolInfoInteger(S,SYMBOL_TRADE_STOPS_LEVEL)*PointSize;
   double freeze=(double)SymbolInfoInteger(S,SYMBOL_TRADE_FREEZE_LEVEL)*PointSize;
   return MathMax(stops, freeze) + 2*PointSize;
}

datetime BarTime()
{
   datetime t[1];
   if(CopyTime(S, InpTF, 0, 1, t)<1) return 0;
   return t[0];
}

bool NewBar()
{
   datetime t=BarTime();
   if(t==0) return false;
   if(t!=lastBar)
   {
      lastBar=t;
      return true;
   }
   return false;
}

//==================================================================
// PERMISSION
//==================================================================
bool CanTrade()
{
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
   {
      reason="BLOCK: Terminal AutoTrading OFF";
      return false;
   }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      reason="BLOCK: EA Allow Algo Trading OFF";
      return false;
   }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
   {
      reason="BLOCK: Account trading not allowed";
      return false;
   }

   ENUM_SYMBOL_TRADE_MODE tm=(ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(S,SYMBOL_TRADE_MODE);
   if(tm==SYMBOL_TRADE_MODE_DISABLED)
   {
      reason="BLOCK: symbol trade disabled";
      return false;
   }
   if(tm==SYMBOL_TRADE_MODE_CLOSEONLY)
   {
      reason="BLOCK: symbol close only";
      return false;
   }

   if(R_UseSpreadFilter() && R_MaxSpreadPips()>0 && SpreadPips()>R_MaxSpreadPips())
   {
      reason="BLOCK: spread "+DoubleToString(SpreadPips(),2)+" > "+DoubleToString(R_MaxSpreadPips(),2);
      return false;
   }

   return true;
}

//==================================================================
// POSITION / LOT
//==================================================================
bool HasPos()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==S && (long)PositionGetInteger(POSITION_MAGIC)==InpMagic)
         return true;
   }
   return false;
}

double NLot(double lot)
{
   lot = MathFloor(lot/VolStep)*VolStep;
   lot = MathMax(VolMin, MathMin(VolMax, lot));
   int d=2;
   if(VolStep<0.01) d=3;
   if(VolStep<0.001) d=4;
   return NormalizeDouble(lot,d);
}

double LotByRisk(double slDist)
{
   if(InpUseFixedLot) return NLot(InpFixedLot);

   double riskMoney=AccountInfoDouble(ACCOUNT_BALANCE)*R_RiskPercent()/100.0;
   if(TickSize<=0 || TickValue<=0 || slDist<=0) return NLot(InpFixedLot);
   double lossPerLot=(slDist/TickSize)*TickValue;
   if(lossPerLot<=0) return NLot(InpFixedLot);
   return NLot(riskMoney/lossPerLot);
}

//==================================================================
// BREAKOUT
//==================================================================
bool CalcRange()
{
   int need=R_Lookback()+5;
   MqlRates r[];
   ArraySetAsSeries(r,true);
   int got=CopyRates(S,InpTF,0,need,r);
   if(got<need)
   {
      reason="NO BAR DATA "+IntegerToString(got)+"/"+IntegerToString(need)+" for "+S+" "+EnumToString(InpTF);
      return false;
   }

   int start = (R_EntryMode()==ENTRY_BREAK_CURRENT ? 1 : 2);
   double hi=-DBL_MAX, lo=DBL_MAX;
   for(int i=start; i<start+R_Lookback(); i++)
   {
      if(r[i].high>hi) hi=r[i].high;
      if(r[i].low<lo) lo=r[i].low;
   }

   rangeHigh=hi;
   rangeLow=lo;
   signalClose=r[1].close;
   return true;
}

int Signal()
{
   if(R_EntryMode()==ENTRY_FORCE_TEST)
   {
      reason="FORCE TEST ENTRY";
      return 1;
   }

   if(!CalcRange()) return 0;

   double buf=P2P(R_BreakBufferPips());
   MqlTick t;
   if(!Tick(t)) return 0;

   if(R_EntryMode()==ENTRY_BREAK_CURRENT)
   {
      if(R_AllowBuy() && t.ask > rangeHigh + buf)
      {
         reason="BUY current breakout";
         return 1;
      }
      if(R_AllowSell() && t.bid < rangeLow - buf)
      {
         reason="SELL current breakout";
         return -1;
      }
   }
   else
   {
      MqlRates r[];
      ArraySetAsSeries(r,true);
      if(CopyRates(S,InpTF,0,3,r)<3) return 0;

      if(R_AllowBuy() && r[1].close > rangeHigh + buf)
      {
         reason="BUY close breakout";
         return 1;
      }
      if(R_AllowSell() && r[1].close < rangeLow - buf)
      {
         reason="SELL close breakout";
         return -1;
      }
   }

   reason="WAIT: no breakout";
   return 0;
}

double SLPips(int dir,double entry)
{
   double p=R_ManualSLPips();
   if(InpSLMode==SL_RANGE && rangeHigh>0 && rangeLow>0)
   {
      if(dir==1) p=ToPip(entry-(rangeLow-P2P(InpRangeSLBufferPips)));
      else       p=ToPip((rangeHigh+P2P(InpRangeSLBufferPips))-entry);
   }

   p=MathAbs(p);
   if(InpMinSLPips>0) p=MathMax(p,InpMinSLPips);
   if(InpMaxSLPips>0) p=MathMin(p,InpMaxSLPips);
   return p;
}

void FixStops(int dir,double entry,double &sl,double &tp)
{
   double minD=StopLevelPrice();
   if(dir==1)
   {
      if(sl>=entry-minD) sl=NPrice(entry-minD);
      if(tp<=entry+minD) tp=NPrice(entry+minD);
   }
   else
   {
      if(sl<=entry+minD) sl=NPrice(entry+minD);
      if(tp>=entry-minD) tp=NPrice(entry-minD);
   }
}

//==================================================================
// ORDER ENGINE
//==================================================================
bool SendDeal(int dir,double lot,double sl,double tp)
{
   MqlTick t;
   if(!Tick(t)) return false;

   ENUM_ORDER_TYPE_FILLING fills[3] = {ORDER_FILLING_IOC, ORDER_FILLING_FOK, ORDER_FILLING_RETURN};

   if(!InpTryAllFillingModes)
   {
      fills[0]=(ENUM_ORDER_TYPE_FILLING)ORDER_FILLING_IOC;
      fills[1]=(ENUM_ORDER_TYPE_FILLING)ORDER_FILLING_IOC;
      fills[2]=(ENUM_ORDER_TYPE_FILLING)ORDER_FILLING_IOC;
   }

   for(int k=0;k<3;k++)
   {
      MqlTradeRequest req;
      MqlTradeResult res;
      ZeroMemory(req);
      ZeroMemory(res);

      req.action=TRADE_ACTION_DEAL;
      req.symbol=S;
      req.magic=InpMagic;
      req.volume=lot;
      req.type=(dir==1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
      req.price=(dir==1 ? t.ask : t.bid);
      req.deviation=InpDeviationPoints;
      req.type_filling=fills[k];
      req.type_time=ORDER_TIME_GTC;
      req.comment=(dir==1 ? "BRKDBG_BUY" : "BRKDBG_SELL");

      if(!InpOpenWithoutSLTPThenModify)
      {
         req.sl=sl;
         req.tp=tp;
      }

      ResetLastError();
      lastRequest="dir="+(dir==1?"BUY":"SELL")+
                  " lot="+DoubleToString(lot,2)+
                  " price="+DoubleToString(req.price,Dig)+
                  " sl="+DoubleToString(sl,Dig)+
                  " tp="+DoubleToString(tp,Dig)+
                  " fill="+EnumToString(fills[k]);

      bool ok=OrderSend(req,res);

      lastErrorText=res.comment+" | retcode="+IntegerToString((int)res.retcode)+
                " | lastErrorText="+IntegerToString(_LastError)+
                " | fill="+EnumToString(fills[k]);

      if(ok && (res.retcode==TRADE_RETCODE_DONE || res.retcode==TRADE_RETCODE_PLACED))
      {
         if(InpOpenWithoutSLTPThenModify)
         {
            Sleep(100);
            bool modified=false;
            for(int i=PositionsTotal()-1;i>=0;i--)
            {
               ulong tk=PositionGetTicket(i);
               if(tk==0) continue;
               if(PositionGetString(POSITION_SYMBOL)==S && (long)PositionGetInteger(POSITION_MAGIC)==InpMagic)
               {
                  trade.SetExpertMagicNumber(InpMagic);
                  trade.SetDeviationInPoints(InpDeviationPoints);
                  if(trade.PositionModify(tk,sl,tp))
                  {
                     lastModify="OK";
                     modified=true;
                  }
                  else
                  {
                     lastModify=trade.ResultRetcodeDescription()+" | code="+IntegerToString((int)trade.ResultRetcode());
                  }
                  break;
               }
            }
            if(!modified && lastModify=="--") lastModify="No position found";
         }
         return true;
      }
   }
   return false;
}

//==================================================================
// ENTRY
//==================================================================
void TryEntry()
{
   if(ReplayFX_Enable && ReplayFXMode == REPLAYFX_PAUSED)
   {
      state = "REPLAYFX";
      reason = "ReplayFX mode PAUSED blocks Breakout entries";
      return;
   }

   if(!CanTrade())
   {
      state="BLOCKED";
      return;
   }

   if(R_OnePositionOnly() && HasPos())
   {
      state="IN POSITION";
      reason="one position only";
      return;
   }

   datetime bt=BarTime();
   if(R_OneEntryPerBar() && bt!=0 && lastEntryBar==bt)
   {
      state="WAIT";
      reason="entry already this bar";
      return;
   }

   int dir=Signal();
   if(dir==0)
   {
      state="WAIT";
      return;
   }

   MqlTick t;
   if(!Tick(t)) return;

   double entry=(dir==1 ? t.ask : t.bid);

   if(R_EntryMode()==ENTRY_FORCE_TEST)
   {
      rangeHigh=entry+P2P(10);
      rangeLow=entry-P2P(10);
   }

   double slp=SLPips(dir,entry);
   double sl=(dir==1 ? NPrice(entry-P2P(slp)) : NPrice(entry+P2P(slp)));
   double tp=(dir==1 ? NPrice(entry+P2P(slp*R_RR())) : NPrice(entry-P2P(slp*R_RR())));

   FixStops(dir,entry,sl,tp);
   double lot=LotByRisk(MathAbs(entry-sl));

   if(ReplayFX_Enable)
   {
      ReplayFXSignal signal;
      signal.eaName = "BreakoutRR Debug EA";
      signal.symbol = S;
      signal.timeframe = ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)_Period);
      signal.side = (dir == 1 ? "BUY" : "SELL");
      signal.entry = entry;
      signal.sl = sl;
      signal.tp = tp;
      signal.rr = R_RR();
      signal.riskPercent = R_RiskPercent();
      signal.lot = lot;
      signal.screenshotPath = "";
      signal.timeoutSeconds = 300;
      signal.reason = "Breakout range setup | rangeHigh=" + DoubleToString(rangeHigh, Dig) +
                      " | rangeLow=" + DoubleToString(rangeLow, Dig) +
                      " | signalClose=" + DoubleToString(signalClose, Dig) +
                      " | SLpips=" + DoubleToString(slp, 1);

      if(!ReplayFX_RequestApproval(signal))
      {
         if(ReplayFXLastApprovalStatus == "REJECTED") state = "REJECTED";
         else if(ReplayFXLastApprovalStatus == "EXPIRED") state = "EXPIRED";
         else if(ReplayFXLastApprovalStatus == "OFFLINE") state = "WAIT APPROVAL FAILED";
         else state = "REPLAYFX BLOCK";
         reason = "ReplayFX approval status: " + ReplayFXLastApprovalStatus;
         Log("[REPLAYFX BLOCK] " + reason);
         return;
      }
   }

   bool ok=SendDeal(dir,lot,sl,tp);
   if(ok)
   {
      lastEntryBar=bt;
      lastDir=dir;
      state=(dir==1 ? "BUY ENTRY" : "SELL ENTRY");
      lastSignal=(dir==1 ? "BUY" : "SELL")+
                 " | range "+DoubleToString(rangeLow,Dig)+"-"+DoubleToString(rangeHigh,Dig)+
                 " | SLp="+DoubleToString(slp,1)+" | RR=1:"+DoubleToString(R_RR(),1);
      Log("[ENTRY OK] "+lastSignal);
   }
   else
   {
      state="ENTRY FAIL";
      reason=lastErrorText;
      Log("[ENTRY FAIL] "+lastErrorText+" | "+lastRequest);
   }

   if(ReplayFX_Enable && ReplayFXLastSignalId != "")
      ReplayFX_ResolveSignal(ReplayFXLastSignalId, (ok ? "EXECUTED" : "FAILED"), ok ? "Breakout entry placed" : lastErrorText);
}

//==================================================================
// STATS / GUI
//==================================================================
void ScanStats()
{
   tradeTotal=wins=losses=0;
   gp=gl=0.0;

   HistorySelect(0,TimeCurrent());
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong tk=HistoryDealGetTicket(i);
      if(tk==0) continue;
      if(HistoryDealGetString(tk,DEAL_SYMBOL)!=S) continue;
      if((long)HistoryDealGetInteger(tk,DEAL_MAGIC)!=InpMagic) continue;
      if((int)HistoryDealGetInteger(tk,DEAL_ENTRY)!=DEAL_ENTRY_OUT) continue;

      int type=(int)HistoryDealGetInteger(tk,DEAL_TYPE);
      if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL) continue;

      double p=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
      tradeTotal++;
      if(p>0){ wins++; gp+=p; }
      else { losses++; gl+=MathAbs(p); }
   }
}

double WRLast(int n)
{
   int c=0,w=0;
   HistorySelect(0,TimeCurrent());
   for(int i=HistoryDealsTotal()-1;i>=0 && c<n;i--)
   {
      ulong tk=HistoryDealGetTicket(i);
      if(tk==0) continue;
      if(HistoryDealGetString(tk,DEAL_SYMBOL)!=S) continue;
      if((long)HistoryDealGetInteger(tk,DEAL_MAGIC)!=InpMagic) continue;
      if((int)HistoryDealGetInteger(tk,DEAL_ENTRY)!=DEAL_ENTRY_OUT) continue;

      int type=(int)HistoryDealGetInteger(tk,DEAL_TYPE);
      if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL) continue;

      double p=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
      c++;
      if(p>0) w++;
   }
   return c>0 ? (double)w*100.0/(double)c : 0.0;
}

void L(string name,int x,int y,string txt,color clr,int size=9)
{
   string n=PFX+name;
   if(ObjectFind(0,n)<0)
   {
      ObjectCreate(0,n,OBJ_LABEL,0,0,0);
      ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetString(0,n,OBJPROP_FONT,"Consolas");
      ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
      ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
   }
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,size);
   ObjectSetString(0,n,OBJPROP_TEXT,txt);
   ObjectSetInteger(0,n,OBJPROP_COLOR,clr);
}

void R(string name,int x,int y,int w,int h,color bg,color border)
{
   string n=PFX+name;
   if(ObjectFind(0,n)<0)
   {
      ObjectCreate(0,n,OBJ_RECTANGLE_LABEL,0,0,0);
      ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
      ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
   }
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);
   ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);
   ObjectSetInteger(0,n,OBJPROP_COLOR,border);
}

void GUI()
{
   if(!InpShowGUI) return;
   if(InpPanelRefreshSec>0 && TimeCurrent()<lastPanel+InpPanelRefreshSec) return;
   lastPanel=TimeCurrent();

   MqlTick t;
   Tick(t);
   ScanStats();

   int x=InpPanelX,y=InpPanelY;
   R("BG",x,y,620,410,clrBlack,clrDodgerBlue);

   double wr=tradeTotal>0 ? (double)wins*100.0/(double)tradeTotal : 0.0;
   double pf=gl>0 ? gp/gl : (gp>0?999.0:0.0);

   L("T",x+10,y+8,"BreakoutRR Debug EA v2.00 - RR 1:"+DoubleToString(R_RR(),1),clrDeepSkyBlue,10);
   L("S",x+10,y+30,"STATE: "+state+" | REASON: "+reason,clrGold,8);
   L("E",x+10,y+50,"LAST ERROR: "+lastErrorText,clrSilver,8);
   L("Q",x+10,y+70,"LAST REQUEST: "+lastRequest,clrSilver,8);
   L("M",x+10,y+90,"MODIFY: "+lastModify,clrSilver,8);

   L("SYM",x+10,y+115,"Chart="+_Symbol+" | TradeSymbol="+S+" | Digits="+IntegerToString(Dig)+
     " | PointSize="+DoubleToString(PointSize,8)+" | Pip="+DoubleToString(Pip,8),clrAqua,8);

   L("BRO",x+10,y+135,"TradeMode="+IntegerToString((int)TradeMode)+" | FillMask="+IntegerToString((int)FillMask)+
     " | TickSize="+DoubleToString(TickSize,8)+" | TickValue="+DoubleToString(TickValue,5),clrSilver,8);

   L("MKT",x+10,y+155,"Bid="+DoubleToString(t.bid,Dig)+" Ask="+DoubleToString(t.ask,Dig)+
     " | Spread="+DoubleToString(SpreadPips(),2)+" pip | StopLevel="+DoubleToString(ToPip(StopLevelPrice()),1)+" pip",clrSilver,8);

   L("SET",x+10,y+178,"Mode="+EnumToString(R_EntryMode())+" | TF="+EnumToString(InpTF)+" | Lookback="+IntegerToString(R_Lookback())+
     " | Buffer="+DoubleToString(R_BreakBufferPips(),1),clrSilver,8);

   L("RNG",x+10,y+198,"RangeHigh="+DoubleToString(rangeHigh,Dig)+" | RangeLow="+DoubleToString(rangeLow,Dig)+
     " | Close="+DoubleToString(signalClose,Dig),clrAqua,8);

   L("RR",x+10,y+220,"SLMode="+(InpSLMode==SL_MANUAL?"MANUAL":"RANGE")+
     " | ManualSL="+DoubleToString(R_ManualSLPips(),1)+" | RR=1:"+DoubleToString(R_RR(),2)+
     " | NoSLTPThenModify="+(InpOpenWithoutSLTPThenModify?"ON":"OFF"),clrSilver,8);

   L("POS",x+10,y+242,"HasPosition="+(HasPos()?"YES":"NO")+" | OnePosition="+(R_OnePositionOnly()?"ON":"OFF")+
     " | OneEntryPerBar="+(R_OneEntryPerBar()?"ON":"OFF"),clrWhite,8);

   L("SIG",x+10,y+264,"LastSignal: "+lastSignal,clrWhite,8);

   L("STAT",x+10,y+290,"Trades="+IntegerToString(tradeTotal)+" | W/L "+IntegerToString(wins)+"/"+IntegerToString(losses)+
     " | WR="+DoubleToString(wr,1)+"% | PF="+DoubleToString(pf,2)+" | Net="+DoubleToString(gp-gl,2),
     pf>=1?clrLime:clrTomato,8);

   L("WR",x+10,y+312,"WR10="+DoubleToString(WRLast(10),1)+"% | WR100="+DoubleToString(WRLast(100),1)+
     "% | WR300="+DoubleToString(WRLast(300),1)+"%",clrSilver,8);

   L("LC",x+10,y+334,"LastCloseNet="+DoubleToString(lastCloseNet,2)+" | LastComm="+DoubleToString(lastComm,2),
     lastCloseNet>=0?clrLime:clrTomato,8);

   L("EX",x+10,y+356,"LastExec: "+lastExec,clrSilver,8);
   L("TIP",x+10,y+380,"TEST: set EntryMode=ENTRY_FORCE_TEST. Kalau gagal, kirim LAST ERROR + LAST REQUEST.",clrDodgerBlue,8);
}

//==================================================================
// EVENTS
//==================================================================
int OnInit()
{
   if(!InitSymbol()) return INIT_FAILED;
   if(ReplayFX_Enable)
   {
      ReplayFXEAFileName = "BreakoutRR_DebugEA_v2_00_ReplayFX.mq5";
      ReplayFX_Init(ReplayFX_BackendURL, ReplayFX_SecretToken, ReplayFX_TerminalId, ReplayFX_InstanceId, "BreakoutRR Debug EA", ReplayFX_Mode, ReplayFX_PollSeconds, ReplayFX_TakeScreenshotOnSignal, 360, ReplayFX_AllowRemoteConfig);
      ReplayFX_SendHeartbeat("INIT");
      ReplayFX_LoadConfig();
      EventSetTimer(MathMax(2, ReplayFX_PollSeconds));
   }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviationPoints);

   Print("=== BreakoutRR Debug EA v2.00 loaded | chart=",_Symbol,
         " trade=",S,
         " TF=",EnumToString(InpTF),
         " point=",DoubleToString(PointSize,8),
         " pip=",DoubleToString(Pip,8),
         " tick=",DoubleToString(TickSize,8),
         " RR=1:",DoubleToString(R_RR(),2)," ===");

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason_code)
{
   if(ReplayFX_Enable) EventKillTimer();
   ObjectsDeleteAll(0,PFX);
}

void OnTimer()
{
   if(!ReplayFX_Enable) return;
   ReplayFX_LoadConfig();
   ReplayFX_SendHeartbeat("ONLINE");
}

void OnTick()
{
   if(R_EntryMode()==ENTRY_BREAK_CURRENT || R_EntryMode()==ENTRY_FORCE_TEST)
      TryEntry();
   else if(NewBar())
      TryEntry();

   GUI();
}

void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& req,
                        const MqlTradeResult& res)
{
   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD) return;

   ulong deal=trans.deal;
   if(deal==0) return;

   HistorySelect(TimeCurrent()-86400*30,TimeCurrent());

   if((long)HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) return;
   if(HistoryDealGetString(deal,DEAL_SYMBOL)!=S) return;

   int entry=(int)HistoryDealGetInteger(deal,DEAL_ENTRY);
   ENUM_DEAL_TYPE dtype=(ENUM_DEAL_TYPE)HistoryDealGetInteger(deal,DEAL_TYPE);
   double price=HistoryDealGetDouble(deal,DEAL_PRICE);
   double comm=HistoryDealGetDouble(deal,DEAL_COMMISSION);
   lastComm=comm;

   if(entry==DEAL_ENTRY_IN)
   {
      lastExec=(dtype==DEAL_TYPE_BUY?"BUY":"SELL")+" fill "+DoubleToString(price,Dig)+
               " | spread "+DoubleToString(SpreadPips(),2)+" pip";
   }
   else if(entry==DEAL_ENTRY_OUT)
   {
      lastCloseNet=HistoryDealGetDouble(deal,DEAL_PROFIT)+
                   HistoryDealGetDouble(deal,DEAL_SWAP)+
                   HistoryDealGetDouble(deal,DEAL_COMMISSION);
   }
}
//+------------------------------------------------------------------+
