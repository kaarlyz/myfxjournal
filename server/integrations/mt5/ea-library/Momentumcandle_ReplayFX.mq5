//+------------------------------------------------------------------+
//| EA_FiboMomentum_v10.mq5                                          |
//|                                                                  |
//| v10 Features:                                                    |
//| - UNIVERSAL: semua pair, auto-detect pip                         |
//| - TREND FILTER: EMA200 (bias TF custom) + EMA50 (timing M5)     |
//|   BUY: Close>EMA200, EMA200 naik, Close>EMA50, tidak terlalu jauh|
//|   SELL: Close<EMA200, EMA200 turun, Close<EMA50, tidak terlalu jauh|
//|   NO TRADE: EMA200 datar, harga terlalu jauh, M5/M15 konflik    |
//| - WICK SMART FILTER                                              |
//| - MARTINGALE v2:                                                 |
//|   * TP normal (default -0.270), jika semua 4 level kena → TP    |
//|     dikurangi ke level MartFullTP (default 0.236, bisa diset)   |
//|   * SURVIVAL MODE: jika harga mendekati SL (dalam X% dari SL),  |
//|     langsung close semua asal total profit >= MinSurvivalProfit  |
//|   * Min profit survival bisa diset (default 0 = asal > 0)       |
//| - SESI TRADING: Asia/London/NY bisa on/off + custom jam override |
//| - Panel terstruktur per section, semua bisa diubah live         |
//+------------------------------------------------------------------+
#property strict
#include <Trade/Trade.mqh>
#include <ReplayFX_RemoteSDK.mqh>
CTrade trade;

//==================== INPUT GROUPS ====================

// ── GENERAL ──────────────────────────────────────────
input long            MagicNumber           = 26060408;
input ENUM_TIMEFRAMES SignalTF              = PERIOD_M5;   // TF sinyal candle (M5 atau M15)
input bool            DrawFiboObject        = true;
input bool            VerboseLog            = true;

// ── TREND FILTER ─────────────────────────────────────
input bool            UseTrendFilter        = true;        // Aktifkan EMA trend filter
input ENUM_TIMEFRAMES BiasTF               = PERIOD_M15;  // TF bias utama (EMA200)
input int             EMA_Bias_Period       = 200;         // Periode EMA bias (default 200)
input int             EMA_Timing_Period     = 50;          // Periode EMA timing di SignalTF (default 50)
input int             EMA_SlopeCandles      = 3;           // Berapa candle lalu untuk cek slope EMA200
input double          MaxDistFromEMA_Pct    = 2.0;         // Max jarak harga dari EMA200 (% dari harga, 0=OFF)
input double          EMA_FlatThresholdPip  = 3.0;         // EMA200 dianggap "datar" jika slope < X pip (0=OFF)

// ── CANDLE FILTER ────────────────────────────────────
input double          MinBodyPip            = 30.0;
input bool            UseBodyPercentFilter  = false;
input double          MinBodyPercent        = 50.0;

// ── WICK FILTER ──────────────────────────────────────
input bool            UseWickFilter         = true;
input double          MaxOppWickPct         = 40.0;        // Max wick berlawanan arah (% range, 100=OFF)

// ── FIBO LEVEL ───────────────────────────────────────
input double          TP_FiboLevel          = -0.270;      // TP normal (semua mode, kecuali mart full)
input double          SL_FiboLevel          =  1.000;
input double          SL_BufferPip          =  5.0;

// ── ENTRY NORMAL ─────────────────────────────────────
input bool            UseRRMode             = true;
input double          TargetRR              = 2.0;
input double          ManualEntryLevel      = 0.500;

// ── RISK / LIMIT ─────────────────────────────────────
input double          RiskPercent           = 1.0;
input int             MaxTradesDay          = 3;
input double          MaxProfitDayPercent   = 0.0;
input double          MaxProfitMonthPercent = 0.0;
input int             PendingExpiryBars     = 12;
input int             MaxSpreadPoints       = 0;

// ── MARTINGALE ───────────────────────────────────────
input bool            UseMartingale         = false;
input double          MartStartLot          = 0.01;
// TP saat SEMUA 4 level kena (lebih dekat dari TP_FiboLevel untuk kurangi risk)
input double          MartFullTP_Level      = 0.236;       // TP jika semua 4 level hit (0.236 = lebih aman)
// Survival Mode
input bool            UseSurvivalMode       = true;        // Close all saat harga dekati SL & profit > min
input double          SurvivalTriggerPct    = 50.0;        // Trigger jika harga sudah X% mendekati SL dari entry terjauh
input double          MinSurvivalProfit     = 0.0;         // Min total profit untuk trigger survival (0=asal>0)

// ── SESI TRADING ─────────────────────────────────────
// Sesi standar (waktu server broker)
input bool            UseSessionFilter      = false;       // Aktifkan filter sesi
input bool            Session_Asia          = false;       // Sesi Asia (00:00-09:00)
input bool            Session_London        = true;        // Sesi London (07:00-16:00)
input bool            Session_NewYork       = true;        // Sesi New York (13:00-22:00)
// Custom jam override (aktif jika UseSessionFilter=true & CustomSession=true)
input bool            UseCustomSession      = false;       // Override dengan jam custom
input int             CustomStart_Hour      = 8;           // Jam mulai custom (server time)
input int             CustomStart_Min       = 0;
input int             CustomEnd_Hour        = 20;
input int             CustomEnd_Min         = 0;

// ReplayFX Remote
input bool ReplayFX_Enable = true;
input string ReplayFX_BackendURL = "http://127.0.0.1:5000";
input string ReplayFX_SecretToken = "";
input string ReplayFX_TerminalId = "";
input string ReplayFX_InstanceId = "";
input ENUM_REPLAYFX_MODE ReplayFX_Mode = REPLAYFX_NOTIFY_ONLY;
input int ReplayFX_PollSeconds = 10;
input bool ReplayFX_TakeScreenshotOnSignal = true;
input bool ReplayFX_AllowRemoteConfig = true;

//==================== GLOBAL VARS ====================
double   gPoint=0.0, gPipSize=0.0;

// Trend state
int      hEMA_Bias=-1, hEMA_Timing=-1;   // handle indikator
bool     trendBull=false, trendBear=false, trendFlat=false;
string   trendReason="";

// Normal setup
bool     setupActive=false, setupBull=true;
datetime setupTime=0;
int      setupBars=0;
double   fibLow=0.0, fibHigh=0.0;
double   setupEntry=0.0, setupSL=0.0, setupTP=0.0, setupEntryLevel=0.0;
ulong    pendingTicket=0;

// Martingale
bool     martLevelHit[4];
double   martLevelPrice[4], martLevelLot[4];
ulong    martTicket[4];
bool     martSetupActive=false, martBull=true;
datetime martSetupTime=0;
int      martBars=0;
double   martFibLow=0.0, martFibHigh=0.0, martSL=0.0, martTP=0.0;
bool     martAllHit=false;       // true jika semua 4 level sudah kena
double   MART_LEVELS[4]={0.236,0.382,0.500,0.618};

// Stats
int      statTotal=0, statWin=0, statLoss=0;
int      tradesToday=0;
datetime lastDay=0;
int      lastMonth=0, lastYear=0;
double   dayStartBalance=0.0, monthStartBalance=0.0;

struct CandleInfo {
   double bodyPip, bodyPct, oppWickPct, oppWickPip;
   bool bull, sizeOK, domOK, wickOK, trendOK, triggered;
   string skipReason;
};
CandleInfo lastCandle;

// Panel
string PFX="EAFM10_";
color C_BG=C'12,14,24', C_HDR=C'18,55,120', C_BDR=C'45,90,180';
color C_TXT=clrWhite, C_GRN=C'60,200,110', C_YLW=C'225,195,55';
color C_RED=C'215,65,55', C_BLU=C'75,150,245', C_DIM=C'110,115,135';
color C_SEP=C'30,40,70', C_OK=C'25,85,190', C_RS=C'95,45,10';
color C_ORG=C'215,135,25', C_MART=C'195,95,250', C_CYAN=C'55,195,215';
color C_TREND=C'50,200,150', C_SESS=C'200,160,60';
int PX=12, PY=28, PW=296;

//==================== GUI HELPERS ====================
void DelObj(string n){ if(ObjectFind(0,n)>=0) ObjectDelete(0,n); }
void Rect(string n,int x,int y,int w,int h,color bg,int bw=0,color bc=clrBlack){
   DelObj(n); ObjectCreate(0,n,OBJ_RECTANGLE_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x); ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);     ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);  ObjectSetInteger(0,n,OBJPROP_BORDER_TYPE,BORDER_FLAT);
   ObjectSetInteger(0,n,OBJPROP_COLOR,bc);    ObjectSetInteger(0,n,OBJPROP_WIDTH,bw);
   ObjectSetInteger(0,n,OBJPROP_BACK,false);  ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
}
void Lbl(string n,int x,int y,string t,color c,int sz=9){
   DelObj(n); ObjectCreate(0,n,OBJ_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x); ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetString(0,n,OBJPROP_TEXT,t);       ObjectSetInteger(0,n,OBJPROP_COLOR,c);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,sz); ObjectSetString(0,n,OBJPROP_FONT,"Consolas");
   ObjectSetInteger(0,n,OBJPROP_BACK,false);  ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
}
void SetLbl(string n,string t,color c){ ObjectSetString(0,n,OBJPROP_TEXT,t); ObjectSetInteger(0,n,OBJPROP_COLOR,c); }
void Edit(string n,int x,int y,int w,string v){
   DelObj(n); ObjectCreate(0,n,OBJ_EDIT,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x); ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);     ObjectSetInteger(0,n,OBJPROP_YSIZE,21);
   ObjectSetString(0,n,OBJPROP_TEXT,v);       ObjectSetInteger(0,n,OBJPROP_COLOR,clrWhite);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,C'26,28,46');
   ObjectSetInteger(0,n,OBJPROP_BORDER_COLOR,C_BDR);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,9);  ObjectSetString(0,n,OBJPROP_FONT,"Consolas");
   ObjectSetInteger(0,n,OBJPROP_BACK,false);  ObjectSetInteger(0,n,OBJPROP_SELECTABLE,true);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true); ObjectSetInteger(0,n,OBJPROP_READONLY,false);
}
void Btn(string n,int x,int y,int w,int h,string t,color bg){
   DelObj(n); ObjectCreate(0,n,OBJ_BUTTON,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x); ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);     ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetString(0,n,OBJPROP_TEXT,t);       ObjectSetInteger(0,n,OBJPROP_COLOR,clrWhite);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);  ObjectSetInteger(0,n,OBJPROP_FONTSIZE,9);
   ObjectSetString(0,n,OBJPROP_FONT,"Consolas");
   ObjectSetInteger(0,n,OBJPROP_BACK,false);  ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
}
void SectionHeader(string tag,int x,int y,int w,int h,string title,color bg,color tc){
   Rect(PFX+"hd_"+tag,x,y,w,h,bg);
   Lbl(PFX+"ht_"+tag,x+6,y+4,title,tc,8);
}

//==================== PANEL READ ====================
double GetD(string n,double d){ string v=ObjectGetString(0,PFX+n,OBJPROP_TEXT); return(StringLen(v)>0)?StringToDouble(v):d; }
int    GetI(string n,int d)   { string v=ObjectGetString(0,PFX+n,OBJPROP_TEXT); return(StringLen(v)>0)?(int)StringToInteger(v):d; }
bool   GetB(string n,bool d)  { string v=ObjectGetString(0,PFX+n,OBJPROP_TEXT); StringToLower(v);
   if(v=="1"||v=="true"||v=="ya") return true; if(v=="0"||v=="false"||v=="no") return false; return d; }

// Efektif params
bool   EffTrendFilter()     { return GetB("utf",UseTrendFilter); }
int    EffEMABias()         { int i=GetI("emab",EMA_Bias_Period); return(i>0)?i:200; }
int    EffEMATiming()       { int i=GetI("emat",EMA_Timing_Period); return(i>0)?i:50; }
int    EffSlopeCandles()    { int i=GetI("slpc",EMA_SlopeCandles); return(i>0)?i:3; }
double EffMaxDist()         { return GetD("mxd",MaxDistFromEMA_Pct); }
double EffFlatThresh()      { return GetD("flat",EMA_FlatThresholdPip); }
double EffMinBodyPip()      { return GetD("mbp",MinBodyPip); }
bool   EffUseBodyFilter()   { return GetB("ubf",UseBodyPercentFilter); }
double EffBodyPct()         { double d=GetD("bpct",MinBodyPercent); return MathMax(1,MathMin(100,d)); }
bool   EffUseWickFilter()   { return GetB("uwf",UseWickFilter); }
double EffMaxOppWick()      { double d=GetD("mow",MaxOppWickPct); return MathMax(0,MathMin(100,d)); }
double EffTPLevel()         { return GetD("tpl",TP_FiboLevel); }
double EffSLLevel()         { return GetD("sll",SL_FiboLevel); }
double EffSLBuf()           { return GetD("sbuf",SL_BufferPip); }
bool   EffRRMode()          { return GetB("rrm",UseRRMode); }
double EffTargetRR()        { double d=(ReplayFX_Enable&&ReplayFXCfgRR>0.0)?ReplayFXCfgRR:GetD("trr",TargetRR); return(d>0)?d:2.0; }
double EffManualEntry()     { return GetD("men",ManualEntryLevel); }
double EffRisk()            { double d=(ReplayFX_Enable&&ReplayFXCfgRiskPercent>0.0)?ReplayFXCfgRiskPercent:GetD("risk",RiskPercent); return(d>0)?d:1.0; }
int    EffMaxTrades()       { int i=(ReplayFX_Enable&&ReplayFXCfgMaxTradesPerDay>0)?ReplayFXCfgMaxTradesPerDay:GetI("maxd",MaxTradesDay); return(i>0)?i:3; }
double EffMaxDay()          { return GetD("maxpd",MaxProfitDayPercent); }
double EffMaxMonth()        { return GetD("maxpm",MaxProfitMonthPercent); }
int    EffExpiry()          { int i=GetI("exp",PendingExpiryBars); return(i>0)?i:12; }
bool   EffMartMode()        { return GetB("mart",UseMartingale); }
double EffMartStartLot()    { double d=GetD("msl",MartStartLot); return(d>0)?d:0.01; }
double EffMartFullTP()      { return GetD("mftp",MartFullTP_Level); }
bool   EffSurvival()        { return GetB("surv",UseSurvivalMode); }
double EffSurvTrigger()     { double d=GetD("strg",SurvivalTriggerPct); return MathMax(1,MathMin(99,d)); }
double EffMinSurvProfit()   { return GetD("msp",MinSurvivalProfit); }
bool   EffSessionFilter()   { return GetB("usef",UseSessionFilter); }
bool   EffSessAsia()        { return GetB("sas",Session_Asia); }
bool   EffSessLondon()      { return GetB("sln",Session_London); }
bool   EffSessNY()          { return GetB("sny",Session_NewYork); }
bool   EffCustomSess()      { return GetB("cuse",UseCustomSession); }
int    EffCustStartH()      { return GetI("csh",CustomStart_Hour); }
int    EffCustStartM()      { return GetI("csm",CustomStart_Min); }
int    EffCustEndH()        { return GetI("ceh",CustomEnd_Hour); }
int    EffCustEndM()        { return GetI("cem",CustomEnd_Min); }

//==================== AUTO-DETECT PIP ====================
void InitPipSize(){
   gPoint=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   int d=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   gPipSize=(d==5||d==3)?gPoint*10.0:gPoint;
   Print("[INIT] ",_Symbol," Digits=",d," Point=",DoubleToString(gPoint,d)," PipSize=",DoubleToString(gPipSize,d));
}
double ToPip(double dist){ return(gPipSize>0)?dist/gPipSize:0; }

//==================== FIBO PRICE ====================
double PriceAtLevel(double lvl,bool bull,double fLow,double fHigh){
   double rng=fHigh-fLow;
   return bull?fHigh-lvl*rng:fLow+lvl*rng;
}

//==================== SESSION CHECK ====================
bool IsSessionAllowed(){
   if(!EffSessionFilter()) return true;
   MqlDateTime dt; TimeToStruct(TimeCurrent(),dt);
   int nowMin=dt.hour*60+dt.min;

   if(EffCustomSess()){
      int s=EffCustStartH()*60+EffCustStartM();
      int e=EffCustEndH()*60+EffCustEndM();
      if(s<e) return(nowMin>=s&&nowMin<e);
      else    return(nowMin>=s||nowMin<e); // overnight
   }

   // Sesi standar
   bool allowed=false;
   if(EffSessAsia()  &&nowMin>=0  &&nowMin<540)  allowed=true; // 00:00-09:00
   if(EffSessLondon()&&nowMin>=420&&nowMin<960)  allowed=true; // 07:00-16:00
   if(EffSessNY()    &&nowMin>=780&&nowMin<1320) allowed=true; // 13:00-22:00
   return allowed;
}

string GetSessionStr(){
   if(!EffSessionFilter()) return "ALL";
   MqlDateTime dt; TimeToStruct(TimeCurrent(),dt);
   int nm=dt.hour*60+dt.min;
   string s="";
   if(nm>=0  &&nm<540)  s+="Asia ";
   if(nm>=420&&nm<960)  s+="London ";
   if(nm>=780&&nm<1320) s+="NY ";
   if(StringLen(s)>0)
   {
      StringTrimRight(s);
      return s;
   }
   return "--";
}

//==================== TREND FILTER ====================
void UpdateTrendFilter(){
   if(!EffTrendFilter()){ trendBull=true; trendBear=true; trendFlat=false; trendReason="Filter OFF"; return; }
   if(hEMA_Bias<0||hEMA_Timing<0){ trendBull=false; trendBear=false; trendReason="EMA handle error"; return; }

   // EMA200 dari BiasTF
   double emaBiasNow[1], emaBiasPrev[1];
   int sc=EffSlopeCandles();
   if(CopyBuffer(hEMA_Bias,0,0,1,emaBiasNow)<1||
      CopyBuffer(hEMA_Bias,0,sc,1,emaBiasPrev)<1){
      trendBull=false; trendBear=false; trendReason="EMA copy error"; return;
   }

   // EMA50 dari SignalTF (timing)
   double emaTiming[1];
   if(CopyBuffer(hEMA_Timing,0,0,1,emaTiming)<1){
      trendBull=false; trendBear=false; trendReason="EMA timing error"; return;
   }

   // Harga close BiasTF
   double closeBias[1];
   if(CopyClose(_Symbol,BiasTF,0,1,closeBias)<1){
      trendBull=false; trendBear=false; trendReason="Close bias error"; return;
   }

   // Harga close SignalTF
   double closeSignal[1];
   if(CopyClose(_Symbol,SignalTF,0,1,closeSignal)<1){
      trendBull=false; trendBear=false; trendReason="Close signal error"; return;
   }

   double ema200=emaBiasNow[0];
   double ema200prev=emaBiasPrev[0];
   double ema50=emaTiming[0];
   double priceBias=closeBias[0];
   double priceSignal=closeSignal[0];

   // Cek slope EMA200
   double slopePip=ToPip(MathAbs(ema200-ema200prev));
   bool ema200rising =(ema200>ema200prev);
   bool ema200falling=(ema200<ema200prev);
   bool ema200flat   =(EffFlatThresh()>0&&slopePip<EffFlatThresh());

   // Cek jarak harga dari EMA200
   bool tooFar=false;
   if(EffMaxDist()>0){
      double distPct=MathAbs(priceBias-ema200)/ema200*100.0;
      if(distPct>EffMaxDist()) tooFar=true;
   }

   trendFlat=ema200flat;
   trendBull=false; trendBear=false;

   // Cek M5/BiasTF konflik
   bool m5Bull=(priceSignal>ema50);
   bool m5Bear=(priceSignal<ema50);
   bool biasBull=(priceBias>ema200);
   bool biasBear=(priceBias<ema200);
   bool conflict=(m5Bull&&biasBear)||(m5Bear&&biasBull);

   if(ema200flat){ trendReason="EMA200 datar (slope="+DoubleToString(slopePip,1)+"pip)"; return; }
   if(tooFar)    { trendReason="Harga terlalu jauh dari EMA200"; return; }
   if(conflict)  { trendReason="M5 vs Bias konflik"; return; }

   // BULL: semua konfirmasi bull
   if(biasBull&&ema200rising&&m5Bull){
      trendBull=true;
      trendReason="BULL: Price>EMA200, EMA200↑ +"+DoubleToString(slopePip,1)+"pip, M5>EMA50";
   }
   // BEAR: semua konfirmasi bear
   else if(biasBear&&ema200falling&&m5Bear){
      trendBear=true;
      trendReason="BEAR: Price<EMA200, EMA200↓ "+DoubleToString(slopePip,1)+"pip, M5<EMA50";
   }
   else{
      trendReason="Tidak ada konfirmasi trend jelas";
   }
}

//==================== PANEL CREATE ====================
void CreatePanel(){
   int totalH=1060;
   Rect(PFX+"bg",PX,PY,PW,totalH,C_BG,1,C_BDR);
   Rect(PFX+"mhd",PX,PY,PW,26,C_HDR);
   Lbl(PFX+"ttl",PX+8,PY+6,"  EA FiboMomentum v10  |  Universal + Trend",clrWhite,9);

   int r=PY+34, lx=PX+10, ex=PX+192, ew=82;

   // ── SYMBOL INFO ───────────────────────────────────
   SectionHeader("sym",PX+6,r,PW-12,18,"▸ SYMBOL INFO",C'10,25,50',C_CYAN); r+=22;
   Lbl(PFX+"vsym",lx,r,"Symbol: "+_Symbol,C_CYAN,8); r+=13;
   Lbl(PFX+"vpip",lx,r,"PipSize: auto",C_CYAN,8); r+=15;
   Rect(PFX+"sep0",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── TREND FILTER ──────────────────────────────────
   SectionHeader("tr",PX+6,r,PW-12,18,"▸ TREND FILTER (EMA)",C'10,40,30',C_TREND); r+=22;
   Lbl(PFX+"lutf", lx,r,"Trend Filter (1=ON 0=OFF):",C_TXT);  Edit(PFX+"utf",ex,r-3,ew,UseTrendFilter?"1":"0"); r+=21;
   Lbl(PFX+"lemab",lx,r,"EMA Bias Period (def 200):", C_TXT);  Edit(PFX+"emab",ex,r-3,ew,IntegerToString(EMA_Bias_Period)); r+=21;
   Lbl(PFX+"lemat",lx,r,"EMA Timing Period (def 50):",C_TXT);  Edit(PFX+"emat",ex,r-3,ew,IntegerToString(EMA_Timing_Period)); r+=21;
   Lbl(PFX+"lslpc",lx,r,"Slope cek (candles lalu):", C_TXT);  Edit(PFX+"slpc",ex,r-3,ew,IntegerToString(EMA_SlopeCandles)); r+=21;
   Lbl(PFX+"lflat",lx,r,"Flat threshold (pip):",     C_TXT);  Edit(PFX+"flat",ex,r-3,ew,DoubleToString(EMA_FlatThresholdPip,1)); r+=21;
   Lbl(PFX+"lmxd", lx,r,"Max dist EMA200 % (0=OFF):",C_TXT);  Edit(PFX+"mxd",ex,r-3,ew,DoubleToString(MaxDistFromEMA_Pct,1)); r+=18;
   // Status trend live
   Lbl(PFX+"vtbias",lx,r,"Bias  : ---",C_DIM); r+=13;
   Lbl(PFX+"vtrend",lx,r,"Trend : ---",C_DIM); r+=15;
   Rect(PFX+"sep1",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── CANDLE FILTER ─────────────────────────────────
   SectionHeader("cf",PX+6,r,PW-12,18,"▸ CANDLE FILTER",C'25,25,60',C_BLU); r+=22;
   Lbl(PFX+"lmbp", lx,r,"Min Body (pip):",           C_TXT);  Edit(PFX+"mbp",ex,r-3,ew,DoubleToString(MinBodyPip,1)); r+=21;
   Lbl(PFX+"lubf", lx,r,"Body% Filter (1=ON 0=OFF):",C_TXT);  Edit(PFX+"ubf",ex,r-3,ew,UseBodyPercentFilter?"1":"0"); r+=21;
   Lbl(PFX+"lbpct",lx,r,"Min Body% (jika ON):",      C_TXT);  Edit(PFX+"bpct",ex,r-3,ew,DoubleToString(MinBodyPercent,1)); r+=21;
   // Wick
   Lbl(PFX+"luwf", lx,r,"Wick Filter (1=ON 0=OFF):", C_CYAN); Edit(PFX+"uwf",ex,r-3,ew,UseWickFilter?"1":"0"); r+=21;
   Lbl(PFX+"lmow", lx,r,"Max Opp Wick % (100=OFF):", C_CYAN); Edit(PFX+"mow",ex,r-3,ew,DoubleToString(MaxOppWickPct,1)); r+=18;
   // Info candle terakhir
   Lbl(PFX+"vc1",lx,r,"Arah  : ---",C_DIM); r+=13;
   Lbl(PFX+"vc2",lx,r,"Body  : ---",C_DIM); r+=13;
   Lbl(PFX+"vc3",lx,r,"Pip   : ---",C_DIM); r+=13;
   Lbl(PFX+"vc4",lx,r,"Body% : ---",C_DIM); r+=13;
   Lbl(PFX+"vc6",lx,r,"Wick  : ---",C_DIM); r+=13;
   Lbl(PFX+"vc7",lx,r,"Trend : ---",C_DIM); r+=13;
   Lbl(PFX+"vc5",lx,r,"Status: ---",C_DIM); r+=15;
   Rect(PFX+"sep2",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── FIBO & ENTRY ──────────────────────────────────
   SectionHeader("fe",PX+6,r,PW-12,18,"▸ FIBO LEVEL & ENTRY",C'30,20,60',C_BDR); r+=22;
   Lbl(PFX+"inf1",lx,r,"BULL: 0=High 1=Low -0.27=TP atas",C_DIM,7); r+=12;
   Lbl(PFX+"inf2",lx,r,"BEAR: 0=Low  1=High -0.27=TP bawah",C_DIM,7); r+=13;
   Lbl(PFX+"ltpl",lx,r,"TP Level (normal):",  C_TXT);  Edit(PFX+"tpl",ex,r-3,ew,DoubleToString(TP_FiboLevel,3)); r+=21;
   Lbl(PFX+"lsll",lx,r,"SL Level:",           C_TXT);  Edit(PFX+"sll",ex,r-3,ew,DoubleToString(SL_FiboLevel,3)); r+=21;
   Lbl(PFX+"lsbuf",lx,r,"SL Buffer (pip):",   C_TXT);  Edit(PFX+"sbuf",ex,r-3,ew,DoubleToString(SL_BufferPip,1)); r+=21;
   Lbl(PFX+"lrrm",lx,r,"RR Mode (1=auto):",   C_TXT);  Edit(PFX+"rrm",ex,r-3,ew,UseRRMode?"1":"0"); r+=21;
   Lbl(PFX+"ltrr",lx,r,"Target RR:",          C_TXT);  Edit(PFX+"trr",ex,r-3,ew,DoubleToString(TargetRR,2)); r+=21;
   Lbl(PFX+"lmen",lx,r,"Manual Entry Level:", C_TXT);  Edit(PFX+"men",ex,r-3,ew,DoubleToString(ManualEntryLevel,3)); r+=15;
   Rect(PFX+"sep3",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── MARTINGALE ────────────────────────────────────
   SectionHeader("mg",PX+6,r,PW-12,18,"▸ MARTINGALE",C'30,10,50',C_MART); r+=22;
   Lbl(PFX+"inf_m",lx,r,"Entry: 0.236→0.382→0.500→0.618 | Lot: x1,x2,x4,x8",C_DIM,7); r+=12;
   Lbl(PFX+"lmart",lx,r,"Martingale (1=ON 0=OFF):",  C_MART); Edit(PFX+"mart",ex,r-3,ew,UseMartingale?"1":"0"); r+=21;
   Lbl(PFX+"lmsl", lx,r,"Start Lot:",                C_MART); Edit(PFX+"msl",ex,r-3,ew,DoubleToString(MartStartLot,2)); r+=21;
   Lbl(PFX+"lmftp",lx,r,"TP jika SEMUA 4 kena:",     C_MART); Edit(PFX+"mftp",ex,r-3,ew,DoubleToString(MartFullTP_Level,3)); r+=18;
   // Survival Mode
   Lbl(PFX+"lsurv",lx,r,"Survival Mode (1=ON):",     C_ORG);  Edit(PFX+"surv",ex,r-3,ew,UseSurvivalMode?"1":"0"); r+=21;
   Lbl(PFX+"lstrg",lx,r,"Trigger jika harga X% ke SL:",C_ORG);Edit(PFX+"strg",ex,r-3,ew,DoubleToString(SurvivalTriggerPct,1)); r+=21;
   Lbl(PFX+"lmsp", lx,r,"Min profit survival ($):",  C_ORG);  Edit(PFX+"msp",ex,r-3,ew,DoubleToString(MinSurvivalProfit,2)); r+=18;
   // Level info
   Lbl(PFX+"vm1",lx,r,"L1 0.236 : menunggu",C_DIM); r+=13;
   Lbl(PFX+"vm2",lx,r,"L2 0.382 : menunggu",C_DIM); r+=13;
   Lbl(PFX+"vm3",lx,r,"L3 0.500 : menunggu",C_DIM); r+=13;
   Lbl(PFX+"vm4",lx,r,"L4 0.618 : menunggu",C_DIM); r+=13;
   Lbl(PFX+"vmmode",lx,r,"TP Mode: normal",C_MART); r+=13;
   Lbl(PFX+"vmsurv",lx,r,"Survival: ---",C_ORG); r+=13;
   Lbl(PFX+"vmtot",lx,r,"Total Lot: ---  Pos: 0/4",C_MART); r+=15;
   Rect(PFX+"sep4",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── SESI TRADING ──────────────────────────────────
   SectionHeader("ss",PX+6,r,PW-12,18,"▸ SESI TRADING",C'40,30,10',C_SESS); r+=22;
   Lbl(PFX+"lusef",lx,r,"Session Filter (1=ON):",    C_SESS); Edit(PFX+"usef",ex,r-3,ew,UseSessionFilter?"1":"0"); r+=21;
   Lbl(PFX+"lsas", lx,r,"Asia  00:00-09:00 (1=ON):", C_SESS); Edit(PFX+"sas",ex,r-3,ew,Session_Asia?"1":"0"); r+=21;
   Lbl(PFX+"lsln", lx,r,"London 07:00-16:00 (1=ON):",C_SESS); Edit(PFX+"sln",ex,r-3,ew,Session_London?"1":"0"); r+=21;
   Lbl(PFX+"lsny", lx,r,"NY    13:00-22:00 (1=ON):", C_SESS); Edit(PFX+"sny",ex,r-3,ew,Session_NewYork?"1":"0"); r+=21;
   Lbl(PFX+"lcuse",lx,r,"Custom Jam (1=ON, override):",C_YLW);Edit(PFX+"cuse",ex,r-3,ew,UseCustomSession?"1":"0"); r+=21;
   Lbl(PFX+"lcsh", lx,r,"Jam Mulai (HH):",           C_YLW); Edit(PFX+"csh",ex,r-3,ew,IntegerToString(CustomStart_Hour)); r+=21;
   Lbl(PFX+"lcsm", lx,r,"Menit Mulai (MM):",         C_YLW); Edit(PFX+"csm",ex,r-3,ew,IntegerToString(CustomStart_Min)); r+=21;
   Lbl(PFX+"lceh", lx,r,"Jam Selesai (HH):",         C_YLW); Edit(PFX+"ceh",ex,r-3,ew,IntegerToString(CustomEnd_Hour)); r+=21;
   Lbl(PFX+"lcem", lx,r,"Menit Selesai (MM):",       C_YLW); Edit(PFX+"cem",ex,r-3,ew,IntegerToString(CustomEnd_Min)); r+=18;
   Lbl(PFX+"vsess",lx,r,"Sesi aktif: ---",C_SESS); r+=15;
   Rect(PFX+"sep5",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── RISK / LIMIT ──────────────────────────────────
   SectionHeader("rl",PX+6,r,PW-12,18,"▸ RISK / LIMIT",C'35,15,15',C_RED); r+=22;
   Lbl(PFX+"lrisk",lx,r,"Risk/Trade %:",       C_TXT); Edit(PFX+"risk",ex,r-3,ew,DoubleToString(RiskPercent,2)); r+=21;
   Lbl(PFX+"lmaxd",lx,r,"Max Trade/Day:",      C_TXT); Edit(PFX+"maxd",ex,r-3,ew,IntegerToString(MaxTradesDay)); r+=21;
   Lbl(PFX+"lmaxpd",lx,r,"Max Profit Day %:",  C_TXT); Edit(PFX+"maxpd",ex,r-3,ew,DoubleToString(MaxProfitDayPercent,2)); r+=21;
   Lbl(PFX+"lmaxpm",lx,r,"Max Profit Month %:",C_TXT); Edit(PFX+"maxpm",ex,r-3,ew,DoubleToString(MaxProfitMonthPercent,2)); r+=21;
   Lbl(PFX+"lexp",lx,r,"Pending Expiry Bars:", C_TXT); Edit(PFX+"exp",ex,r-3,ew,IntegerToString(PendingExpiryBars)); r+=15;
   Rect(PFX+"sep6",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── STATUS ────────────────────────────────────────
   SectionHeader("st",PX+6,r,PW-12,18,"▸ STATUS",C'15,40,15',C_GRN); r+=22;
   Lbl(PFX+"vbal",  lx,r,"Balance : ---",C_GRN); r+=13;
   Lbl(PFX+"vgrow", lx,r,"Day% / Month% : ---",C_YLW); r+=13;
   Lbl(PFX+"vcnt",  lx,r,"Trade/Hari : 0/---",C_YLW); r+=13;
   Lbl(PFX+"vsetup",lx,r,"Setup : menunggu",C_DIM); r+=13;
   Lbl(PFX+"vfibo", lx,r,"Low / High : ---",C_DIM); r+=13;
   Lbl(PFX+"vprice",lx,r,"E / SL / TP : ---",C_DIM); r+=13;
   Lbl(PFX+"vlot",  lx,r,"Lot / RR : ---",C_DIM); r+=15;
   Rect(PFX+"sep7",PX+6,r,PW-12,1,C_SEP); r+=8;

   // ── STATS ─────────────────────────────────────────
   Lbl(PFX+"vstat",lx,r,"Total 0 | W 0 | L 0",C_TXT); r+=13;
   Lbl(PFX+"vwr",  lx,r,"WR -- | EV --",C_YLW); r+=15;
   Rect(PFX+"sep8",PX+6,r,PW-12,1,C_SEP); r+=8;
   Btn(PFX+"bap",PX+6,  r,138,23,"APPLY/RESET SETUP",C_OK);
   Btn(PFX+"brs",PX+152,r,130,23,"RESET DAY COUNT",C_RS);
   ChartRedraw(0);
}

//==================== UTILS ====================
void Log(string s){ if(VerboseLog) Print(s); }

bool HasOpenPosition(){
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong t=PositionGetTicket(i); if(!t) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol&&
         (long)PositionGetInteger(POSITION_MAGIC)==MagicNumber) return true;
   } return false;
}

double GetTotalFloatingProfit(){
   double tot=0;
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong t=PositionGetTicket(i); if(!t) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol&&
         (long)PositionGetInteger(POSITION_MAGIC)==MagicNumber)
         tot+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   } return tot;
}

void CloseAllPositions(string reason){
   Log("[CLOSE ALL] "+reason);
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong t=PositionGetTicket(i); if(!t) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if((long)PositionGetInteger(POSITION_MAGIC)!=MagicNumber) continue;
      trade.PositionClose(t,50);
   }
}

void CancelPending(string reason){
   if(pendingTicket!=0){
      if(OrderSelect(pendingTicket)) trade.OrderDelete(pendingTicket);
      Log("[CANCEL] "+reason); pendingTicket=0;
   }
}

void ClearSetup(string reason){
   CancelPending(reason); setupActive=false; setupBars=0;
   setupEntry=setupSL=setupTP=setupEntryLevel=fibLow=fibHigh=0;
   ObjectDelete(0,PFX+"fibo"); Log("[CLEAR] "+reason);
}

void ClearMartSetup(string reason){
   martSetupActive=false; martBars=0; martAllHit=false;
   martFibLow=martFibHigh=martSL=martTP=0;
   for(int i=0;i<4;i++){ martLevelHit[i]=false; martLevelPrice[i]=martLevelLot[i]=0; martTicket[i]=0; }
   ObjectDelete(0,PFX+"martfibo"); Log("[MART CLEAR] "+reason);
}

void CheckDateReset(){
   MqlDateTime n; TimeToStruct(TimeCurrent(),n);
   datetime today=StringToTime((string)n.year+"."+(string)n.mon+"."+(string)n.day);
   if(today!=lastDay){ lastDay=today; tradesToday=0; dayStartBalance=AccountInfoDouble(ACCOUNT_BALANCE); Log("[DAY RESET]"); }
   if(n.mon!=lastMonth||n.year!=lastYear){ lastMonth=n.mon; lastYear=n.year; monthStartBalance=AccountInfoDouble(ACCOUNT_BALANCE); Log("[MONTH RESET]"); }
}

double GrowthPct(double s){ if(s<=0) return 0; return(AccountInfoDouble(ACCOUNT_BALANCE)-s)/s*100.0; }

bool ProfitLimitReached(){
   if(EffMaxDay()>0  &&GrowthPct(dayStartBalance)  >=EffMaxDay())  { Log("[LIMIT] Profit harian"); return true; }
   if(EffMaxMonth()>0&&GrowthPct(monthStartBalance)>=EffMaxMonth()){ Log("[LIMIT] Profit bulanan"); return true; }
   return false;
}

bool IsNewBar(ENUM_TIMEFRAMES tf){
   static datetime lM5=0,lM15=0;
   datetime t[1]; if(CopyTime(_Symbol,tf,0,1,t)<1) return false;
   if(tf==PERIOD_M5) { if(t[0]!=lM5) { lM5=t[0]; return true; } }
   if(tf==PERIOD_M15){ if(t[0]!=lM15){ lM15=t[0]; return true; } }
   return false;
}

double CalcLot(double slDist,double riskPct){
   double bal=AccountInfoDouble(ACCOUNT_BALANCE);
   double rAmt=bal*riskPct/100.0;
   double ts=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   double tv=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
   if(ts<=0||tv<=0||slDist<=0) return SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double lpl=(slDist/ts)*tv; if(lpl<=0) return SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double mn=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double mx=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   return NormalizeDouble(MathMax(mn,MathMin(mx,MathFloor((rAmt/lpl)/step)*step)),2);
}

double NormLot(double lot){
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double mn=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double mx=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   return NormalizeDouble(MathMax(mn,MathMin(mx,MathFloor(lot/step)*step)),2);
}

void ScanHistory(){
   statTotal=statWin=statLoss=0;
   HistorySelect(0,TimeCurrent());
   for(int i=0;i<HistoryDealsTotal();i++){
      ulong tk=HistoryDealGetTicket(i); if(!tk) continue;
      if(HistoryDealGetString(tk,DEAL_SYMBOL)!=_Symbol) continue;
      if((long)HistoryDealGetInteger(tk,DEAL_MAGIC)!=MagicNumber) continue;
      if((int)HistoryDealGetInteger(tk,DEAL_ENTRY)!=DEAL_ENTRY_OUT) continue;
      int tp=(int)HistoryDealGetInteger(tk,DEAL_TYPE);
      if(tp!=DEAL_TYPE_BUY&&tp!=DEAL_TYPE_SELL) continue;
      double p=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
      statTotal++; if(p>0) statWin++; else statLoss++;
   }
}

//==================== PANEL UPDATE ====================
void UpdateCandlePanel(){
   color ca=lastCandle.bull?C_BLU:C_RED;
   SetLbl(PFX+"vc1","Arah  : "+(lastCandle.bull?"BULL ▲":"BEAR ▼"),ca);
   SetLbl(PFX+"vc2","Body  : "+DoubleToString(lastCandle.bodyPip,1)+"pip  "+DoubleToString(lastCandle.bodyPct,1)+"%",C_TXT);
   double mp=EffMinBodyPip();
   SetLbl(PFX+"vc3","Pip   : "+(lastCandle.sizeOK?"✓ ":"✗ ")+DoubleToString(lastCandle.bodyPip,1)+(lastCandle.sizeOK?">=":"<")+DoubleToString(mp,1)+"pip",lastCandle.sizeOK?C_GRN:C_RED);
   if(EffUseBodyFilter())
      SetLbl(PFX+"vc4","Body% : "+(lastCandle.domOK?"✓ ":"✗ ")+DoubleToString(lastCandle.bodyPct,1)+(lastCandle.domOK?">=":"<")+DoubleToString(EffBodyPct(),1)+"%",lastCandle.domOK?C_GRN:C_RED);
   else SetLbl(PFX+"vc4","Body% : OFF",C_DIM);
   if(EffUseWickFilter())
      SetLbl(PFX+"vc6","Wick  : "+(lastCandle.wickOK?"✓ ":"✗ ")+"lawan="+DoubleToString(lastCandle.oppWickPct,1)+"% max="+DoubleToString(EffMaxOppWick(),1)+"%",lastCandle.wickOK?C_GRN:C_RED);
   else SetLbl(PFX+"vc6","Wick  : OFF",C_DIM);
   if(EffTrendFilter())
      SetLbl(PFX+"vc7","Trend : "+(lastCandle.trendOK?"✓ ":"✗ ")+(lastCandle.trendOK?(lastCandle.bull?"BULL ok":"BEAR ok"):lastCandle.skipReason),lastCandle.trendOK?C_GRN:C_RED);
   else SetLbl(PFX+"vc7","Trend : OFF",C_DIM);
   SetLbl(PFX+"vc5","Status: "+(lastCandle.triggered?"✓ SETUP AKTIF":"✗ "+lastCandle.skipReason),lastCandle.triggered?C_GRN:C_RED);
}

void UpdateTrendPanel(){
   // EMA200 value info
   if(hEMA_Bias>=0){
      double eb[1]; CopyBuffer(hEMA_Bias,0,0,1,eb);
      SetLbl(PFX+"vtbias","Bias  : EMA"+IntegerToString(EffEMABias())+"@"+EnumToString(BiasTF)+"="+DoubleToString(eb[0],_Digits),C_TREND);
   }
   color tc=(trendBull||trendBear)?C_TREND:(trendFlat?C_YLW:C_RED);
   string ts=trendBull?"▲ BULL":trendBear?"▼ BEAR":trendFlat?"◆ FLAT":"✗ NO";
   SetLbl(PFX+"vtrend","Trend : "+ts+" | "+trendReason,tc);
}

void UpdateMartPanel(){
   if(!EffMartMode()||!martSetupActive){
      for(int i=0;i<4;i++) SetLbl(PFX+"vm"+(string)(i+1),"L"+(string)(i+1)+" "+DoubleToString(MART_LEVELS[i],3)+" : menunggu",C_DIM);
      SetLbl(PFX+"vmmode","TP Mode: normal",C_DIM);
      SetLbl(PFX+"vmsurv","Survival: ---",C_DIM);
      SetLbl(PFX+"vmtot","Total Lot: ---  Pos: 0/4",C_DIM); return;
   }
   double tot=0; int hit=0;
   string dir=martBull?"▲BUY":"▼SELL";
   for(int i=0;i<4;i++){
      string lb="L"+(string)(i+1)+" "+DoubleToString(MART_LEVELS[i],3)+" @"+DoubleToString(martLevelPrice[i],_Digits);
      if(martLevelHit[i]){ lb+=" ✓ lot="+DoubleToString(martLevelLot[i],2); tot+=martLevelLot[i]; hit++; SetLbl(PFX+"vm"+(string)(i+1),lb,C_GRN); }
      else                { lb+=" ("+dir+")"; SetLbl(PFX+"vm"+(string)(i+1),lb,C_YLW); }
   }
   // TP mode
   string tpMode=martAllHit
      ?"FULL TP @ "+DoubleToString(EffMartFullTP(),3)+" (semua kena)"
      :"Normal TP @ "+DoubleToString(EffTPLevel(),3);
   SetLbl(PFX+"vmmode","TP Mode: "+tpMode,martAllHit?C_ORG:C_MART);
   // Survival info
   if(EffSurvival()&&martSetupActive){
      double fp=GetTotalFloatingProfit();
      SetLbl(PFX+"vmsurv","Survival ON | Float P/L: $"+DoubleToString(fp,2),fp>=0?C_GRN:C_RED);
   } else SetLbl(PFX+"vmsurv","Survival: OFF",C_DIM);
   SetLbl(PFX+"vmtot","Total Lot: "+DoubleToString(tot,2)+"  Pos: "+(string)hit+"/4",C_MART);
}

void UpdatePanel(){
   int digs=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   SetLbl(PFX+"vsym","Symbol: "+_Symbol,C_CYAN);
   SetLbl(PFX+"vpip","PipSize: "+DoubleToString(gPipSize,digs)+" | Digits: "+(string)digs,C_CYAN);
   double bal=AccountInfoDouble(ACCOUNT_BALANCE);
   SetLbl(PFX+"vbal","Balance : $"+DoubleToString(bal,2),C_GRN);
   SetLbl(PFX+"vgrow","Day%/Month%: "+DoubleToString(GrowthPct(dayStartBalance),2)+"%/"+DoubleToString(GrowthPct(monthStartBalance),2)+"%",C_YLW);
   SetLbl(PFX+"vcnt","Trade/Hari : "+(string)tradesToday+" / "+(string)EffMaxTrades()+" | Sesi: "+GetSessionStr(),C_YLW);

   if(setupActive&&!EffMartMode()){
      SetLbl(PFX+"vsetup","Setup: "+(setupBull?"BULL BuyLimit":"BEAR SellLimit")+" bars="+(string)setupBars,setupBull?C_BLU:C_RED);
      SetLbl(PFX+"vfibo","Low="+DoubleToString(fibLow,_Digits)+" Hi="+DoubleToString(fibHigh,_Digits),C_ORG);
      SetLbl(PFX+"vprice","E="+DoubleToString(setupEntry,_Digits)+" SL="+DoubleToString(setupSL,_Digits)+" TP="+DoubleToString(setupTP,_Digits),C_TXT);
      double rr=MathAbs(setupTP-setupEntry)/MathMax(MathAbs(setupEntry-setupSL),gPoint);
      SetLbl(PFX+"vlot","Lot="+DoubleToString(CalcLot(MathAbs(setupEntry-setupSL),EffRisk()),2)+" RR="+DoubleToString(rr,2),C_GRN);
   } else if(martSetupActive&&EffMartMode()){
      SetLbl(PFX+"vsetup","MART: "+(martBull?"BULL":"BEAR")+" bars="+(string)martBars+(martAllHit?" [ALL HIT]":""),C_MART);
      SetLbl(PFX+"vfibo","Low="+DoubleToString(martFibLow,_Digits)+" Hi="+DoubleToString(martFibHigh,_Digits),C_ORG);
      SetLbl(PFX+"vprice","SL="+DoubleToString(martSL,_Digits)+" TP="+DoubleToString(martTP,_Digits),C_TXT);
      SetLbl(PFX+"vlot","StartLot="+DoubleToString(EffMartStartLot(),2)+" MaxLot="+DoubleToString(EffMartStartLot()*8,2),C_MART);
   } else {
      SetLbl(PFX+"vsetup","Setup : menunggu "+(EffMartMode()?"[MART]":"[NORMAL]"),C_DIM);
      SetLbl(PFX+"vfibo","Low / High : ---",C_DIM);
      SetLbl(PFX+"vprice","E / SL / TP : ---",C_DIM);
      SetLbl(PFX+"vlot","Lot / RR : ---",C_DIM);
   }
   UpdateCandlePanel();
   UpdateTrendPanel();
   UpdateMartPanel();
   ScanHistory();
   double wr=(statTotal>0)?statWin*100.0/statTotal:0;
   double rr=EffTargetRR();
   double ev=(statTotal>0)?((wr/100.0*rr)-(1.0-wr/100.0)):0;
   SetLbl(PFX+"vstat","Total "+(string)statTotal+" | W "+(string)statWin+" | L "+(string)statLoss,C_TXT);
   SetLbl(PFX+"vwr","WR "+DoubleToString(wr,1)+"% | EV "+DoubleToString(ev,3)+"R",ev>=0?C_GRN:C_RED);
   SetLbl(PFX+"vsess","Sesi aktif: "+GetSessionStr()+(EffSessionFilter()?"":" (filter OFF)"),C_SESS);
   ChartRedraw(0);
}

//==================== FIBO DRAW ====================
void DrawFibo(){
   if(!DrawFiboObject) return;
   ObjectDelete(0,PFX+"fibo"); datetime t2=TimeCurrent();
   if(setupBull) ObjectCreate(0,PFX+"fibo",OBJ_FIBO,0,setupTime,fibLow,t2,fibHigh);
   else          ObjectCreate(0,PFX+"fibo",OBJ_FIBO,0,setupTime,fibHigh,t2,fibLow);
   ObjectSetInteger(0,PFX+"fibo",OBJPROP_COLOR,C_ORG);
   ObjectSetInteger(0,PFX+"fibo",OBJPROP_RAY_RIGHT,true);
   double lv[8]={-0.270,0.000,0.236,0.382,0.500,0.618,0.745,1.000};
   ObjectSetInteger(0,PFX+"fibo",OBJPROP_LEVELS,8);
   for(int i=0;i<8;i++){ ObjectSetDouble(0,PFX+"fibo",OBJPROP_LEVELVALUE,i,lv[i]); ObjectSetString(0,PFX+"fibo",OBJPROP_LEVELTEXT,i,DoubleToString(lv[i],3)+"  %$"); }
}

void DrawMartFibo(){
   if(!DrawFiboObject) return;
   ObjectDelete(0,PFX+"martfibo"); datetime t2=TimeCurrent();
   if(martBull) ObjectCreate(0,PFX+"martfibo",OBJ_FIBO,0,martSetupTime,martFibLow,t2,martFibHigh);
   else         ObjectCreate(0,PFX+"martfibo",OBJ_FIBO,0,martSetupTime,martFibHigh,t2,martFibLow);
   ObjectSetInteger(0,PFX+"martfibo",OBJPROP_COLOR,C_MART);
   ObjectSetInteger(0,PFX+"martfibo",OBJPROP_RAY_RIGHT,true);
   double lv[8]={-0.270,0.000,0.236,0.382,0.500,0.618,0.745,1.000};
   ObjectSetInteger(0,PFX+"martfibo",OBJPROP_LEVELS,8);
   for(int i=0;i<8;i++){ ObjectSetDouble(0,PFX+"martfibo",OBJPROP_LEVELVALUE,i,lv[i]); ObjectSetString(0,PFX+"martfibo",OBJPROP_LEVELTEXT,i,DoubleToString(lv[i],3)+" M"); }
}

//==================== SCAN CANDLE ====================
void ScanCandle(){
   ENUM_TIMEFRAMES tf=(SignalTF==PERIOD_M15)?PERIOD_M15:PERIOD_M5;
   double o=iOpen(_Symbol,tf,1), c=iClose(_Symbol,tf,1);
   double h=iHigh(_Symbol,tf,1), l=iLow(_Symbol,tf,1);
   datetime ct=iTime(_Symbol,tf,1);
   if(h<=l||ct<=0||gPipSize<=0) return;

   double body=MathAbs(c-o), range=h-l;
   double bodyPip=ToPip(body), bodyPct=(range>0)?body/range*100.0:0.0;
   bool bull=(c>o), bear=(c<o);

   // Wick
   double oppWick=bull?(h-MathMax(o,c)):(MathMin(o,c)-l);
   double oppWickPct=(range>0)?oppWick/range*100.0:0.0;

   bool sizeOK=(body>=EffMinBodyPip()*gPipSize);
   bool domOK=(!EffUseBodyFilter())||(bodyPct>=EffBodyPct());
   bool wickOK=(!EffUseWickFilter())||(oppWickPct<=EffMaxOppWick());

   // Trend check: bull candle hanya jika trend bull, bear candle hanya jika trend bear
   bool trendOK=false;
   if(!EffTrendFilter()) trendOK=true;
   else if(bull&&trendBull) trendOK=true;
   else if(bear&&trendBear) trendOK=true;

   lastCandle.bodyPip=bodyPip; lastCandle.bodyPct=bodyPct;
   lastCandle.oppWickPct=oppWickPct; lastCandle.oppWickPip=ToPip(oppWick);
   lastCandle.bull=bull; lastCandle.sizeOK=sizeOK; lastCandle.domOK=domOK;
   lastCandle.wickOK=wickOK; lastCandle.trendOK=trendOK;
   lastCandle.triggered=false; lastCandle.skipReason="";

   Log("[CANDLE] "+(bull?"BULL":"BEAR")+" body="+DoubleToString(bodyPip,1)
       +"pip("+DoubleToString(bodyPct,1)+"%) wick="+DoubleToString(oppWickPct,1)
       +"% size="+string(sizeOK)+" dom="+string(domOK)+" wick="+string(wickOK)+" trend="+string(trendOK));

   // Routing
   if(EffMartMode()){ if(martSetupActive){ lastCandle.skipReason="Mart setup aktif"; return; } }
   else             { if(setupActive){ lastCandle.skipReason="Setup lama aktif"; return; } }

   // Validasi
   if(!(bull||bear))              { lastCandle.skipReason="Doji"; return; }
   if(!sizeOK)                    { lastCandle.skipReason="Body kecil "+DoubleToString(bodyPip,1)+"pip<"+DoubleToString(EffMinBodyPip(),1)+"pip"; return; }
   if(!domOK)                     { lastCandle.skipReason="Body% kecil "+DoubleToString(bodyPct,1)+"%"; return; }
   if(!wickOK)                    { lastCandle.skipReason="Wick lawan "+DoubleToString(oppWickPct,1)+"%>"+DoubleToString(EffMaxOppWick(),1)+"%"; return; }
   if(!trendOK)                   { lastCandle.skipReason="Trend filter: "+trendReason; return; }
   if(!IsSessionAllowed())        { lastCandle.skipReason="Di luar sesi trading"; return; }
   if(ProfitLimitReached())       { lastCandle.skipReason="Profit limit"; return; }
   if(tradesToday>=EffMaxTrades()){ lastCandle.skipReason="Max trade/hari"; return; }
   int effectiveMaxSpread = (ReplayFX_Enable && ReplayFXCfgMaxSpread > 0.0 ? (int)ReplayFXCfgMaxSpread : MaxSpreadPoints);
   if(effectiveMaxSpread>0){
      double sp=(SymbolInfoDouble(_Symbol,SYMBOL_ASK)-SymbolInfoDouble(_Symbol,SYMBOL_BID))/gPoint;
      if(sp>effectiveMaxSpread){ lastCandle.skipReason="Spread besar"; return; }
   }
   if(EffMartMode()) SetupMartingale(bull,ct,h,l);
   else              SetupNormal(bull,ct,h,l);
}

//==================== SETUP NORMAL ====================
void SetupNormal(bool bull,datetime ct,double h,double l){
   setupBull=bull; setupTime=ct; setupBars=0; fibLow=l; fibHigh=h;
   double buf=EffSLBuf()*gPipSize;
   double pTP=PriceAtLevel(EffTPLevel(),setupBull,fibLow,fibHigh);
   double pSL=PriceAtLevel(EffSLLevel(),setupBull,fibLow,fibHigh);
   pSL=setupBull?pSL-buf:pSL+buf;
   double ep;
   if(EffRRMode()){ double rr=EffTargetRR(); ep=(pTP+rr*pSL)/(rr+1.0); double rng=fibHigh-fibLow; setupEntryLevel=setupBull?(fibHigh-ep)/rng:(ep-fibLow)/rng; }
   else { double ml=EffManualEntry(); ep=PriceAtLevel(ml,setupBull,fibLow,fibHigh); setupEntryLevel=ml; }
   setupEntry=NormalizeDouble(ep,_Digits); setupSL=NormalizeDouble(pSL,_Digits); setupTP=NormalizeDouble(pTP,_Digits);
   bool valid=setupBull?(setupSL<setupEntry&&setupEntry<setupTP):(setupTP<setupEntry&&setupEntry<setupSL);
   if(!valid){ lastCandle.skipReason="Bad orientation"; setupActive=false; fibLow=fibHigh=0; return; }
   setupActive=true; lastCandle.triggered=true; DrawFibo();
   Log("[NORMAL OK] "+(setupBull?"BULL":"BEAR")+" E="+DoubleToString(setupEntry,_Digits)+" SL="+DoubleToString(setupSL,_Digits)+" TP="+DoubleToString(setupTP,_Digits));
}

//==================== SETUP MARTINGALE ====================
void SetupMartingale(bool bull,datetime ct,double h,double l){
   martBull=bull; martSetupTime=ct; martBars=0; martAllHit=false;
   martFibLow=l; martFibHigh=h;
   double buf=EffSLBuf()*gPipSize;
   martTP=NormalizeDouble(PriceAtLevel(EffTPLevel(),martBull,martFibLow,martFibHigh),_Digits);
   double pSLraw=PriceAtLevel(EffSLLevel(),martBull,martFibLow,martFibHigh);
   martSL=NormalizeDouble(martBull?pSLraw-buf:pSLraw+buf,_Digits);
   double sl=EffMartStartLot();
   for(int i=0;i<4;i++){
      martLevelPrice[i]=NormalizeDouble(PriceAtLevel(MART_LEVELS[i],martBull,martFibLow,martFibHigh),_Digits);
      martLevelLot[i]=NormLot(sl*MathPow(2,i)); martLevelHit[i]=false; martTicket[i]=0;
   }
   bool valid=martBull?(martSL<martFibLow&&martTP>martFibHigh):(martTP<martFibLow&&martSL>martFibHigh);
   if(!valid){ lastCandle.skipReason="Mart bad orientation"; ClearMartSetup("bad orientation"); return; }
   martSetupActive=true; lastCandle.triggered=true; DrawMartFibo();
   Log("[MART SETUP] "+(martBull?"BULL":"BEAR")+" SL="+DoubleToString(martSL,_Digits)+" TP="+DoubleToString(martTP,_Digits));
}

//==================== UPDATE MART TP WHEN ALL HIT ====================
// Jika semua 4 level kena → update TP semua posisi ke MartFullTP_Level (lebih dekat, safer)
void UpdateMartTPIfAllHit(){
   if(martAllHit) return; // sudah diupdate sebelumnya
   bool allHit=true; for(int i=0;i<4;i++) if(!martLevelHit[i]){ allHit=false; break; }
   if(!allHit) return;
   martAllHit=true;
   double newTP=NormalizeDouble(PriceAtLevel(EffMartFullTP(),martBull,martFibLow,martFibHigh),_Digits);
   martTP=newTP;
   Log("[MART ALL HIT] Update TP ke "+DoubleToString(newTP,_Digits)+" (level "+DoubleToString(EffMartFullTP(),3)+")");
   // Update TP semua posisi terbuka
   for(int i=PositionsTotal()-1;i>=0;i--){
      ulong t=PositionGetTicket(i); if(!t) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if((long)PositionGetInteger(POSITION_MAGIC)!=MagicNumber) continue;
      double curSL=PositionGetDouble(POSITION_SL);
      trade.PositionModify(t,curSL,newTP);
   }
}

//==================== SURVIVAL MODE ====================
// Cek apakah harga sudah masuk zona survival (X% mendekati SL dari entry terjauh)
void CheckSurvivalMode(){
   if(!EffMartMode()||!martSetupActive||!EffSurvival()) return;
   bool anyHit=false; for(int i=0;i<4;i++) if(martLevelHit[i]){ anyHit=true; break; }
   if(!anyHit) return;

   // Cari entry terjauh dari TP (= paling dekat ke SL → L4 jika semua hit, atau level terakhir yang hit)
   int lastHit=-1; for(int i=3;i>=0;i--) if(martLevelHit[i]){ lastHit=i; break; }
   if(lastHit<0) return;

   double entryFar=martLevelPrice[lastHit];
   // Jarak dari entry terjauh ke SL
   double distEntryToSL=MathAbs(entryFar-martSL);
   if(distEntryToSL<=0) return;

   // Harga saat ini (mid)
   double mid=(SymbolInfoDouble(_Symbol,SYMBOL_ASK)+SymbolInfoDouble(_Symbol,SYMBOL_BID))/2.0;
   // Seberapa jauh harga sudah bergerak ke arah SL dari entry terjauh
   double distToSL=martBull?entryFar-mid:mid-entryFar; // positif = harga bergerak ke SL
   double pctToSL=(distToSL/distEntryToSL)*100.0;

   double trigPct=EffSurvTrigger();
   double minProfit=EffMinSurvProfit();
   double fp=GetTotalFloatingProfit();

   Log("[SURVIVAL CHECK] pctToSL="+DoubleToString(pctToSL,1)+"% trigger="+DoubleToString(trigPct,1)+"% fp=$"+DoubleToString(fp,2));

   if(pctToSL>=trigPct&&fp>minProfit){
      Log("[SURVIVAL TRIGGER] Close all! pct="+DoubleToString(pctToSL,1)+"% profit=$"+DoubleToString(fp,2));
      CloseAllPositions("Survival mode: pct="+DoubleToString(pctToSL,1)+"%");
      ClearMartSetup("Survival triggered");
   }
}

//==================== MANAGE MARTINGALE ====================
void ManageMartingale(){
   if(!EffMartMode()||!martSetupActive) return;
   if(ProfitLimitReached()) return;
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);

   // Cek semua posisi sudah tutup
   bool anyOpen=false;
   for(int i=0;i<4;i++) if(martLevelHit[i]&&martTicket[i]!=0&&PositionSelectByTicket(martTicket[i])) anyOpen=true;
   bool anyHit=false; for(int i=0;i<4;i++) if(martLevelHit[i]){ anyHit=true; break; }
   if(anyHit&&!anyOpen){ ClearMartSetup("semua posisi tutup"); return; }

   // Cek TP kena dari harga (backup)
   if(martBull&&bid>=martTP){ CloseAllPositions("TP bull"); ClearMartSetup("TP bull"); return; }
   if(!martBull&&ask<=martTP){ CloseAllPositions("TP bear"); ClearMartSetup("TP bear"); return; }

   // Survival check
   CheckSurvivalMode();
   if(!martSetupActive) return;

   // Update TP jika semua level baru saja kena
   UpdateMartTPIfAllHit();

   // Cek entry level baru
   for(int i=0;i<4;i++){
      if(martLevelHit[i]) continue;
      bool trig=(martBull&&bid<=martLevelPrice[i])||(!martBull&&ask>=martLevelPrice[i]);
      if(!trig) continue;
      double price=martBull?ask:bid;
      if(ReplayFX_Enable)
      {
         if(martBull && !ReplayFXCfgAllowBuy) return;
         if(!martBull && !ReplayFXCfgAllowSell) return;
         ReplayFXSignal signal;
         signal.eaName = "Momentum Candle";
         signal.symbol = _Symbol;
         signal.timeframe = ReplayFX_TimeframeToString(SignalTF);
         signal.side = (martBull ? "BUY" : "SELL");
         signal.entry = price;
         signal.sl = martSL;
         signal.tp = martTP;
         signal.rr = 0.0;
         signal.riskPercent = EffRisk();
         signal.lot = martLevelLot[i];
         signal.reason = "Momentum martingale level " + IntegerToString(i + 1);
         signal.timeoutSeconds = 300;
         if(!ReplayFX_RequestApproval(signal))
         {
            Log("[REPLAYFX BLOCK] mart entry skipped: " + ReplayFX_ModeToString(ReplayFXMode));
            return;
         }
      }
      trade.SetExpertMagicNumber(MagicNumber); trade.SetDeviationInPoints(50);
      bool ok=martBull
         ?trade.Buy( martLevelLot[i],_Symbol,price,martSL,martTP,"FM10M_B_L"+(string)(i+1))
         :trade.Sell(martLevelLot[i],_Symbol,price,martSL,martTP,"FM10M_S_L"+(string)(i+1));
      if(ok){
         martLevelHit[i]=true; tradesToday++;
         ulong dk=trade.ResultDeal();
         if(dk&&HistoryDealSelect(dk)) martTicket[i]=(ulong)HistoryDealGetInteger(dk,DEAL_POSITION_ID);
         if(!martTicket[i]) martTicket[i]=dk;
         Log("[MART ENTRY L"+(string)(i+1)+"] lot="+DoubleToString(martLevelLot[i],2)+" @"+DoubleToString(price,_Digits));
         // Langsung cek apakah ini yang terakhir → update TP
         UpdateMartTPIfAllHit();
      } else Log("[MART FAIL L"+(string)(i+1)+"] "+trade.ResultRetcodeDescription());
      if(ReplayFX_Enable && ReplayFXLastSignalId != "")
         ReplayFX_ResolveSignal(ReplayFXLastSignalId, ok ? "EXECUTED" : "FAILED", ok ? "Martingale entry placed" : trade.ResultRetcodeDescription());
      break;
   }
}

//==================== NORMAL PENDING ====================
bool PendingWasTriggered(){ if(!pendingTicket) return false; if(OrderSelect(pendingTicket)) return false; pendingTicket=0; return true; }

void TryPlacePending(){
   if(EffMartMode()) return;
   if(!setupActive||pendingTicket!=0||HasOpenPosition()) return;
   if(ProfitLimitReached()||tradesToday>=EffMaxTrades()) return;
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK), bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double stops=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*gPoint;
   double freeze=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)*gPoint;
   double md=MathMax(stops,freeze)+2*gPoint;
   if(setupBull&&bid>=setupTP-md){ ClearSetup("TP touched"); return; }
   if(!setupBull&&ask<=setupTP+md){ ClearSetup("TP touched"); return; }
   if(setupBull&&setupEntry>=ask-md){ Log("[SKIP] BuyLimit terlalu dekat"); return; }
   if(!setupBull&&setupEntry<=bid+md){ Log("[SKIP] SellLimit terlalu dekat"); return; }
   if(MathAbs(setupEntry-setupSL)<md||MathAbs(setupTP-setupEntry)<md){ ClearSetup("SL/TP terlalu dekat"); return; }
   double lot=CalcLot(MathAbs(setupEntry-setupSL),EffRisk());
   if(ReplayFX_Enable)
   {
      if(setupBull && !ReplayFXCfgAllowBuy) return;
      if(!setupBull && !ReplayFXCfgAllowSell) return;
      ReplayFXSignal signal;
      signal.eaName = "Momentum Candle";
      signal.symbol = _Symbol;
      signal.timeframe = ReplayFX_TimeframeToString(SignalTF);
      signal.side = (setupBull ? "BUY" : "SELL");
      signal.entry = setupEntry;
      signal.sl = setupSL;
      signal.tp = setupTP;
      signal.rr = EffTargetRR();
      signal.riskPercent = EffRisk();
      signal.lot = lot;
      signal.reason = "Momentum candle pending setup";
      signal.timeoutSeconds = 300;
      if(!ReplayFX_RequestApproval(signal))
      {
         Log("[REPLAYFX BLOCK] pending setup skipped: " + ReplayFX_ModeToString(ReplayFXMode));
         return;
      }
   }
   trade.SetExpertMagicNumber(MagicNumber); trade.SetDeviationInPoints(50);
   bool ok=setupBull
      ?trade.BuyLimit(lot,setupEntry,_Symbol,setupSL,setupTP,ORDER_TIME_GTC,0,"FM10_BL")
      :trade.SellLimit(lot,setupEntry,_Symbol,setupSL,setupTP,ORDER_TIME_GTC,0,"FM10_SL");
   if(ok){ pendingTicket=trade.ResultOrder(); Log("[PENDING OK] lot="+DoubleToString(lot,2)); }
   else  { Log("[PENDING FAIL] "+trade.ResultRetcodeDescription()); ClearSetup("pending rejected"); }
   if(ReplayFX_Enable && ReplayFXLastSignalId != "")
      ReplayFX_ResolveSignal(ReplayFXLastSignalId, ok ? "EXECUTED" : "FAILED", ok ? "Pending order placed" : trade.ResultRetcodeDescription());
}

void ManageSetup(){
   if(EffMartMode()||!setupActive) return;
   PendingWasTriggered(); if(HasOpenPosition()) return;
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK), bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   if(pendingTicket!=0){
      if(setupBull&&bid>=setupTP){ ClearSetup("TP touched unfilled"); return; }
      if(!setupBull&&ask<=setupTP){ ClearSetup("TP touched unfilled"); return; }
   }
}

void CountNewClosedTrades(){
   static int lastSeen=0; ScanHistory();
   if(statTotal>lastSeen){
      int nc=statTotal-lastSeen; lastSeen=statTotal;
      if(!EffMartMode()){ tradesToday+=nc; if(!HasOpenPosition()&&setupActive) ClearSetup("trade closed"); }
   }
}

//==================== INIT / DEINIT / EVENTS ====================
int OnInit(){
   if(ReplayFX_Enable)
   {
      ReplayFXEAFileName = "Momentumcandle_ReplayFX.mq5";
      ReplayFX_Init(ReplayFX_BackendURL, ReplayFX_SecretToken, ReplayFX_TerminalId, ReplayFX_InstanceId, "Momentum Candle", ReplayFX_Mode, ReplayFX_PollSeconds, ReplayFX_TakeScreenshotOnSignal, 360, ReplayFX_AllowRemoteConfig);
      ReplayFX_SendHeartbeat("INIT");
      ReplayFX_LoadConfig();
      EventSetTimer(MathMax(2, ReplayFX_PollSeconds));
   }
   InitPipSize();
   if(SignalTF!=PERIOD_M5&&SignalTF!=PERIOD_M15){ Print("[ERROR] SignalTF hanya M5/M15"); return INIT_FAILED; }
   if(gPipSize<=0){ Print("[ERROR] PipSize detect gagal"); return INIT_FAILED; }

   // Buat handle EMA
   hEMA_Bias  =iMA(_Symbol,BiasTF,EMA_Bias_Period,0,MODE_EMA,PRICE_CLOSE);
   hEMA_Timing=iMA(_Symbol,SignalTF,EMA_Timing_Period,0,MODE_EMA,PRICE_CLOSE);
   if(hEMA_Bias==INVALID_HANDLE||hEMA_Timing==INVALID_HANDLE){
      Print("[WARN] EMA handle gagal — trend filter mungkin tidak jalan"); }

   trade.SetExpertMagicNumber(MagicNumber);
   dayStartBalance=monthStartBalance=AccountInfoDouble(ACCOUNT_BALANCE);
   MqlDateTime n; TimeToStruct(TimeCurrent(),n); lastMonth=n.mon; lastYear=n.year;
   ZeroMemory(lastCandle);
   ArrayInitialize(martLevelHit,false); ArrayInitialize(martLevelPrice,0);
   ArrayInitialize(martLevelLot,0);     ArrayInitialize(martTicket,0);
   CheckDateReset(); CreatePanel(); UpdatePanel();

   Print("=== EA_FiboMomentum_v10 === ",_Symbol," ",EnumToString(SignalTF));
   Print("=== Trend: ",(UseTrendFilter?"ON":"OFF"),
         " | Mart: ",(UseMartingale?"ON":"OFF"),
         " | Session: ",(UseSessionFilter?"ON":"OFF"),
         " | WickFilter: ",(UseWickFilter?"ON":"OFF")," ===");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason){
   if(ReplayFX_Enable) EventKillTimer();
   if(hEMA_Bias>=0)   IndicatorRelease(hEMA_Bias);
   if(hEMA_Timing>=0) IndicatorRelease(hEMA_Timing);
   ObjectsDeleteAll(0,PFX);
}

void OnTimer()
{
   if(!ReplayFX_Enable) return;
   ReplayFX_LoadConfig();
   ReplayFX_SendHeartbeat("ONLINE");
}

void OnChartEvent(const int id,const long& lp,const double& dp,const string& sp){
   if(id==CHARTEVENT_OBJECT_CLICK){
      if(sp==PFX+"bap"){ if(EffMartMode()) ClearMartSetup("manual reset"); else ClearSetup("manual reset"); UpdatePanel(); ObjectSetInteger(0,PFX+"bap",OBJPROP_STATE,false); }
      if(sp==PFX+"brs"){ tradesToday=0; dayStartBalance=AccountInfoDouble(ACCOUNT_BALANCE); UpdatePanel(); ObjectSetInteger(0,PFX+"brs",OBJPROP_STATE,false); }
      ChartRedraw(0);
   }
}

void OnTick(){
   CheckDateReset();
   UpdateTrendFilter(); // update setiap tick agar panel selalu fresh

   if(EffMartMode()){
      ManageMartingale();
      if(IsNewBar(SignalTF)){
         if(martSetupActive&&!HasOpenPosition()){ bool anyHit=false; for(int i=0;i<4;i++) if(martLevelHit[i]) anyHit=true; if(!anyHit){ martBars++; if(martBars>=EffExpiry()) ClearMartSetup("expired"); } }
         ScanCandle();
      }
   } else {
      ManageSetup(); TryPlacePending();
      if(IsNewBar(SignalTF)){
         if(setupActive&&!HasOpenPosition()&&!pendingTicket){ setupBars++; if(setupBars>=EffExpiry()) ClearSetup("expired"); }
         ScanCandle(); TryPlacePending();
      }
      CountNewClosedTrades();
   }
   UpdatePanel();
}
//+------------------------------------------------------------------+
