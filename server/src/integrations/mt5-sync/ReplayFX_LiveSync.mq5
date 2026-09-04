//+------------------------------------------------------------------+
//|                                         ReplayFX_LiveSync.mq5    |
//|                        Copyright 2026, ReplayFX / KAFX Journal   |
//|                                       https://replayfx.journal   |
//+------------------------------------------------------------------+
#property copyright "ReplayFX / KAFX Journal"
#property link      "https://replayfx.journal"
#property version   "3.20"
#property description "Native Live Sync & Market Data Engine for ReplayFX Journal"

//--- Inputs
input group "=== ReplayFX Server Connection ==="
input string   InpApiUrl          = "http://127.0.0.1:5000/api/mt5"; // API Server URL
input string   InpApiKey          = "replayfx_secret_token_123";      // API Key / Token

input group "=== Sync Settings ==="
input bool     InpSyncHistory     = true;      // Auto Sync Account History on Start
input bool     InpStreamTicks     = false;     // Stream Live Ticks
input int      InpHeartbeatSec    = 5;          // Heartbeat Interval (Seconds)
input int      InpTaskCheckSec    = 3;          // Task Poll Interval (Seconds)

//--- Global Variables
datetime g_lastHeartbeat = 0;
datetime g_lastTaskCheck = 0;
string   g_terminalId = "";

//+------------------------------------------------------------------+
//| Helper: Send HTTP POST Request via WebRequest                    |
//+------------------------------------------------------------------+
int HttpPost(string endpoint, string jsonPayload, string &responseStr)
{
   string url = InpApiUrl + endpoint;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpApiKey + "\r\n";
   char postData[];
   char resultData[];
   string resultHeaders;

   StringToCharArray(jsonPayload, postData, 0, StringLen(jsonPayload), CP_UTF8);
   
   ResetLastError();
   int res = WebRequest("POST", url, headers, 15000, postData, resultData, resultHeaders);
   int err = GetLastError();
   
   if(res > 0) {
      responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
   } else {
      if(err == 4014) {
         Print("[ReplayFX Sync] ERROR 4014: WebRequest is blocked by MT5 security! Open MT5 Tools -> Options -> Expert Advisors, check 'Allow WebRequest for listed URL', and add: ", InpApiUrl);
      } else {
         Print("[ReplayFX Sync] WebRequest POST failed to ", endpoint, ", Error code: ", err);
      }
   }
   return res;
}

//+------------------------------------------------------------------+
//| Helper: Send HTTP GET Request via WebRequest                     |
//+------------------------------------------------------------------+
int HttpGet(string endpoint, string &responseStr)
{
   string url = InpApiUrl + endpoint;
   string headers = "Authorization: Bearer " + InpApiKey + "\r\n";
   char postData[];
   char resultData[];
   string resultHeaders;

   ResetLastError();
   int res = WebRequest("GET", url, headers, 5000, postData, resultData, resultHeaders);
   int err = GetLastError();

   if(res > 0) {
      responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
   } else {
      if(err == 4014) {
         Print("[ReplayFX Sync] ERROR 4014: WebRequest is blocked by MT5 security! Open MT5 Tools -> Options -> Expert Advisors, check 'Allow WebRequest for listed URL', and add: ", InpApiUrl);
      } else {
         Print("[ReplayFX Sync] WebRequest GET failed to ", endpoint, ", Error code: ", err);
      }
   }
   return res;
}

//+------------------------------------------------------------------+
//| Register Terminal Authentication                                 |
//+------------------------------------------------------------------+
bool RegisterTerminal()
{
   g_terminalId = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   
   string payload = StringFormat(
      "{\"terminalId\":\"%s\",\"accountNumber\":\"%d\",\"broker\":\"%s\",\"brokerServer\":\"%s\",\"platformVersion\":\"%d\",\"apiKey\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"leverage\":\"1:%d\",\"currency\":\"%s\"}",
      g_terminalId,
      AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_COMPANY),
      AccountInfoString(ACCOUNT_SERVER),
      TerminalInfoInteger(TERMINAL_BUILD),
      InpApiKey,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      (int)AccountInfoInteger(ACCOUNT_LEVERAGE),
      AccountInfoString(ACCOUNT_CURRENCY)
   );

   string resp;
   int status = HttpPost("/auth", payload, resp);
   if(status == 200) {
      Print("[ReplayFX Sync] Terminal registered successfully. Account #", g_terminalId);
      return true;
   } else {
      Print("[ReplayFX Sync] Terminal registration failed: HTTP ", status);
      return false;
   }
}

//+------------------------------------------------------------------+
//| Send Heartbeat Ping                                              |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string payload = StringFormat(
      "{\"terminalId\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"status\":\"ONLINE\"}",
      g_terminalId,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY)
   );
   string resp;
   HttpPost("/heartbeat", payload, resp);
   g_lastHeartbeat = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Convert Timeframe String to ENUM_TIMEFRAMES                      |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES StringToTimeframe(string tf)
{
   if(tf == "M1")  return PERIOD_M1;
   if(tf == "M5")  return PERIOD_M5;
   if(tf == "M15") return PERIOD_M15;
   if(tf == "M30") return PERIOD_M30;
   if(tf == "H1")  return PERIOD_H1;
   if(tf == "H4")  return PERIOD_H4;
   if(tf == "D1")  return PERIOD_D1;
   return PERIOD_H1;
}

//+------------------------------------------------------------------+
//| Execute Task Download from Backend Task Pull Queue               |
//+------------------------------------------------------------------+
void CheckAndExecuteTasks()
{
   g_lastTaskCheck = TimeCurrent();
   string resp;
   int status = HttpGet("/tasks/next?terminalId=" + g_terminalId, resp);
   if(status != 200 || StringLen(resp) == 0) return;

   if(StringFind(resp, "\"hasTask\":true") < 0) return;

   Print("[ReplayFX Sync] Pending sync task received from backend: ", resp);

   // Execute candle sync task if rates requested
   if(StringFind(resp, "\"dataType\":\"CANDLE\"") >= 0) {
      string symbol = "XAUUSD";
      int symStart = StringFind(resp, "\"symbol\":\"");
      if(symStart >= 0) {
         symStart += 10;
         int symEnd = StringFind(resp, "\"", symStart);
         if(symEnd > symStart) symbol = StringSubstr(resp, symStart, symEnd - symStart);
      }

      string tfStr = "H1";
      int tfStart = StringFind(resp, "\"timeframe\":\"");
      if(tfStart >= 0) {
         tfStart += 13;
         int tfEnd = StringFind(resp, "\"", tfStart);
         if(tfEnd > tfStart) tfStr = StringSubstr(resp, tfStart, tfEnd - tfStart);
      }

      string jobId = "";
      int jobStart = StringFind(resp, "\"taskId\":\"");
      if(jobStart >= 0) {
         jobStart += 10;
         int jobEnd = StringFind(resp, "\"", jobStart);
         if(jobEnd > jobStart) jobId = StringSubstr(resp, jobStart, jobEnd - jobStart);
      }

      ENUM_TIMEFRAMES tf = StringToTimeframe(tfStr);
      MqlRates rates[];
      ArraySetAsSeries(rates, false);
      int copied = CopyRates(symbol, tf, 0, 1000, rates);
      if(copied <= 0) {
         // Fallback to active chart symbol _Symbol if requested symbol lacks broker suffix (e.g. XAUUSD vs XAUUSD-ECNc)
         copied = CopyRates(_Symbol, tf, 0, 1000, rates);
      }

      if(copied > 0) {
         string candlesJson = "[";
         for(int i = 0; i < copied; i++) {
            if(i > 0) candlesJson += ",";
            candlesJson += StringFormat(
               "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"time\":\"%s\",\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"tickVolume\":%d,\"spread\":%d}",
               symbol, tfStr, TimeToString(rates[i].time, TIME_DATE|TIME_SECONDS),
               rates[i].open, rates[i].high, rates[i].low, rates[i].close,
               (long)rates[i].tick_volume, (int)rates[i].spread
            );
         }
         candlesJson += "]";

         string payload = StringFormat("{\"terminalId\":\"%s\",\"jobId\":\"%s\",\"candles\":%s}", g_terminalId, jobId, candlesJson);
         string postResp;
         HttpPost("/candles", payload, postResp);
         Print("[ReplayFX Sync] Task #", jobId, " executed & ", copied, " candles uploaded.");
      }
   }
}

//+------------------------------------------------------------------+
//| Sync Historical Deals and Orders                                 |
//+------------------------------------------------------------------+
void SyncHistory()
{
   Print("[ReplayFX Sync] Starting historical trade synchronization...");
   HistorySelect(0, TimeCurrent());
   
   int totalDeals = HistoryDealsTotal();
   if(totalDeals == 0) return;

   string dealsJson = "[";
   int count = 0;

   for(int i = 0; i < totalDeals; i++) {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket <= 0) continue;

      long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      long entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double price = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

      if(count > 0) dealsJson += ",";
      dealsJson += StringFormat(
         "{\"dealId\":\"%d\",\"positionId\":\"%d\",\"symbol\":\"%s\",\"type\":\"%s\",\"entryType\":\"%d\",\"volume\":%.2f,\"price\":%.5f,\"profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,\"time\":%d}",
         dealTicket, positionId, symbol, (dealType == DEAL_TYPE_BUY ? "BUY" : "SELL"), entryType, volume, price, profit, commission, swap, (long)dealTime
      );
      count++;

      if(count >= 200) {
         dealsJson += "]";
         string payload = StringFormat("{\"terminalId\":\"%s\",\"deals\":%s}", g_terminalId, dealsJson);
         string resp;
         HttpPost("/history", payload, resp);
         dealsJson = "[";
         count = 0;
      }
   }

   if(count > 0) {
      dealsJson += "]";
      string payload = StringFormat("{\"terminalId\":\"%s\",\"deals\":%s}", g_terminalId, dealsJson);
      string resp;
      HttpPost("/history", payload, resp);
   }

   Print("[ReplayFX Sync] Historical trade synchronization complete.");
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("[ReplayFX Sync] Initializing ReplayFX Native Sync EA v3.20...");
   EventSetTimer(1);

   if(!RegisterTerminal()) {
      Print("[ReplayFX Sync] WARNING: Connection check failed. Retrying on timer...");
   }

   if(InpSyncHistory) {
      SyncHistory();
   }

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   string payload = StringFormat("{\"terminalId\":\"%s\",\"status\":\"OFFLINE\"}", g_terminalId);
   string resp;
   HttpPost("/heartbeat", payload, resp);
   Print("[ReplayFX Sync] Shutdown complete.");
}

//+------------------------------------------------------------------+
//| Expert timer function (Heartbeat & Task Check)                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();
   if(now - g_lastHeartbeat >= InpHeartbeatSec) {
      SendHeartbeat();
   }
   if(now - g_lastTaskCheck >= InpTaskCheckSec) {
      CheckAndExecuteTasks();
   }
}

//+------------------------------------------------------------------+
//| OnTradeTransaction: Live Trade Synchronization                  |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                         const MqlTradeRequest &request,
                         const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) {
      ulong dealTicket = trans.deal;
      if(dealTicket <= 0) return;

      long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) return;

      string symbol = trans.symbol;
      double volume = trans.volume;
      double price = trans.price;
      long positionId = trans.position;
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      long entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);

      string status = (entryType == DEAL_ENTRY_IN) ? "OPEN" : "CLOSED";

      string payload = StringFormat(
         "{\"terminalId\":\"%s\",\"accountNumber\":\"%d\",\"positionId\":\"%d\",\"dealId\":\"%d\",\"symbol\":\"%s\",\"side\":\"%s\",\"lot\":%.2f,\"entryPrice\":%.5f,\"closePrice\":%.5f,\"status\":\"%s\",\"profit\":%.2f,\"openTime\":\"%s\"}",
         g_terminalId,
         AccountInfoInteger(ACCOUNT_LOGIN),
         positionId,
         dealTicket,
         symbol,
         (dealType == DEAL_TYPE_BUY ? "BUY" : "SELL"),
         volume,
         (entryType == DEAL_ENTRY_IN ? price : 0.0),
         (entryType != DEAL_ENTRY_IN ? price : 0.0),
         status,
         profit,
         TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
      );

      string resp;
      HttpPost("/trades", payload, resp);
      Print("[ReplayFX Sync] Live Trade event synced: ", symbol, " ", status, " Position #", positionId);
   }
}
//+------------------------------------------------------------------+
