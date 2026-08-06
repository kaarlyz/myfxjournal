//+------------------------------------------------------------------+
//|                                         ReplayFX_LiveSync.mq5    |
//|                        Copyright 2026, ReplayFX / KAFX Journal   |
//|                                       https://replayfx.journal   |
//+------------------------------------------------------------------+
#property copyright "ReplayFX / KAFX Journal"
#property link      "https://replayfx.journal"
#property version   "3.00"
#property description "Native Live Sync & Market Data Engine for ReplayFX Journal"

//--- Inputs
input group "=== ReplayFX Server Connection ==="
input string   InpApiUrl          = "http://localhost:5000/api/mt5"; // API Server URL
input string   InpApiKey          = "replayfx_secret_token_123";      // API Key / Token

input group "=== Sync Settings ==="
input bool     InpSyncHistory     = true;      // Auto Sync Account History on Start
input bool     InpSyncMarketData  = true;      // Auto Sync Market Data via MT5 task polling
input bool     InpStreamTicks     = false;     // Stream Live Ticks
input int      InpHeartbeatSec    = 5;          // Heartbeat Interval (Seconds)
input int      InpTickBufferSize  = 5000;       // Tick Buffer Limit
input int      InpMaxFlushTimeSec = 1;          // Max Buffer Flush Time (Seconds)

//--- Global Variables
datetime g_lastHeartbeat = 0;
datetime g_lastBufferFlush = 0;
int      g_tickBufferCount = 0;
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
   
   int res = WebRequest("POST", url, headers, 10000, postData, resultData, resultHeaders);
   
   if(res > 0) {
      responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
   } else {
      int err = GetLastError();
      Print("WebRequest POST failed to ", url, ", Error code: ", err, " headers=", resultHeaders);

      // Retry with alternate hostname (localhost <-> 127.0.0.1) to help when only one form is allowed
      string altUrl = url;
      if(StringFind(url, "127.0.0.1") >= 0) altUrl = StringReplace(url, "127.0.0.1", "localhost");
      else if(StringFind(url, "localhost") >= 0) altUrl = StringReplace(url, "localhost", "127.0.0.1");

      if(altUrl != url)
      {
         Print("WebRequest POST retrying with alternate URL: ", altUrl);
         int res2 = WebRequest("POST", altUrl, headers, 10000, postData, resultData, resultHeaders);
         if(res2 > 0)
         {
            responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
            return res2;
         }
         else
         {
            Print("WebRequest POST alternate failed to ", altUrl, ", Error code: ", GetLastError(), " headers=", resultHeaders);
         }
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

   int res = WebRequest("GET", url, headers, 5000, postData, resultData, resultHeaders);
   if(res > 0) {
      responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
   }
   else
   {
      Print("WebRequest GET failed to ", url, ", Error code: ", GetLastError(), " headers=", resultHeaders);

      string altUrl = url;
      if(StringFind(url, "127.0.0.1") >= 0) altUrl = StringReplace(url, "127.0.0.1", "localhost");
      else if(StringFind(url, "localhost") >= 0) altUrl = StringReplace(url, "localhost", "127.0.0.1");

      if(altUrl != url)
      {
         Print("WebRequest GET retrying with alternate URL: ", altUrl);
         int res2 = WebRequest("GET", altUrl, headers, 5000, postData, resultData, resultHeaders);
         if(res2 > 0)
         {
            responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
            return res2;
         }
         else
         {
            Print("WebRequest GET alternate failed to ", altUrl, ", Error code: ", GetLastError(), " headers=", resultHeaders);
         }
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

bool RequestNextTask(string &taskResponse)
{
   if(!InpSyncMarketData) 
   {
      Print("[ReplayFX Sync] Market data sync is disabled.");
      return false;
   }

   Print("[ReplayFX Sync] Requesting next market data task for terminal=", g_terminalId);
   string response;
   int status = HttpGet("/tasks/next?terminalId=" + g_terminalId, response);
   if(status != 200) {
      Print("[ReplayFX Sync] Failed to request next task. HTTP status=", status, " response=", response);
      return false;
   }

   Print("[ReplayFX Sync] Task response: ", response);
   taskResponse = response;
   return true;
}

string NormalizeIsoTimestamp(string timestamp)
{
   int pos = StringFind(timestamp, "T");
   if(pos >= 0) timestamp = StringReplace(timestamp, "T", " ");
   pos = StringFind(timestamp, "Z");
   if(pos >= 0) timestamp = StringSubstr(timestamp, 0, pos);
   pos = StringFind(timestamp, ".");
   if(pos >= 0) timestamp = StringSubstr(timestamp, 0, pos);
   timestamp = StringReplace(timestamp, "-", ".");
   return timestamp;
}

bool ParseIsoDatetime(string value, datetime &result)
{
   string normalized = NormalizeIsoTimestamp(value);
   result = StringToTime(normalized);
   if(result <= 0)
   {
      Print("[ReplayFX Sync] Failed to parse ISO datetime: ", value, " -> ", normalized);
   }
   return(result > 0);
}

string GetJsonValue(string json, string key)
{
   string marker = "\"" + key + "\":";
   int pos = StringFind(json, marker);
   if(pos < 0) return "";
   pos += StringLen(marker);
   while(pos < StringLen(json) && StringGetCharacter(json, pos) == ' ') pos++;
   if(pos >= StringLen(json)) return "";
   int end = pos;
   if(StringGetCharacter(json, pos) == '"') {
      pos++;
      end = StringFind(json, '"', pos);
      if(end < 0) return "";
      return StringSubstr(json, pos, end - pos);
   }
   while(end < StringLen(json) && StringGetCharacter(json, end) != ',' && StringGetCharacter(json, end) != '}' && StringGetCharacter(json, end) != ']') end++;
   return StringSubstr(json, pos, end - pos);
}

bool ParseTask(string taskJson, string &taskId, string &symbol, string &dataType, string &timeframe, datetime &dateFrom, datetime &dateTo)
{
   string hasTask = GetJsonValue(taskJson, "hasTask");
   if(hasTask != "true" && hasTask != "1") return false;

   string taskBody = taskJson;
   int taskIndex = StringFind(taskBody, "\"task\":");
   if(taskIndex < 0) return false;
   taskBody = StringSubstr(taskBody, taskIndex + StringLen("\"task\":"));

   taskId = GetJsonValue(taskBody, "taskId");
   symbol = GetJsonValue(taskBody, "symbol");
   dataType = GetJsonValue(taskBody, "dataType");
   timeframe = GetJsonValue(taskBody, "timeframe");
   string fromStr = GetJsonValue(taskBody, "dateFrom");
   string toStr = GetJsonValue(taskBody, "dateTo");
   if(!ParseIsoDatetime(fromStr, dateFrom) || !ParseIsoDatetime(toStr, dateTo)) return false;

   return taskId != "";
}

ENUM_TIMEFRAMES GetTimeframeEnum(string timeframe)
{
   if(timeframe == "M1") return PERIOD_M1;
   if(timeframe == "M5") return PERIOD_M5;
   if(timeframe == "M15") return PERIOD_M15;
   if(timeframe == "M30") return PERIOD_M30;
   if(timeframe == "H1") return PERIOD_H1;
   if(timeframe == "H4") return PERIOD_H4;
   if(timeframe == "D1") return PERIOD_D1;
   if(timeframe == "W1") return PERIOD_W1;
   if(timeframe == "MN1") return PERIOD_MN1;
   return PERIOD_CURRENT;
}

int GetTimeframeSeconds(string timeframe)
{
   if(timeframe == "M1") return 60;
   if(timeframe == "M5") return 300;
   if(timeframe == "M15") return 900;
   if(timeframe == "M30") return 1800;
   if(timeframe == "H1") return 3600;
   if(timeframe == "H4") return 14400;
   if(timeframe == "D1") return 86400;
   if(timeframe == "W1") return 604800;
   if(timeframe == "MN1") return 2592000;
   return 60;
}

string FormatIsoTime(datetime timeValue)
{
   string timeText = TimeToString(timeValue, TIME_DATE | TIME_SECONDS);
   // Convert from localized string to ISO string for backend compatibility
   timeText = StringReplace(timeText, ".", "-");
   timeText = StringReplace(timeText, " ", "T");
   return timeText + "Z";
}

bool SendCandlesBatch(string jobId, string symbol, string timeframe, MqlRates &rates[], int count)
{
   string candlesJson = "[";
   for(int i = 0; i < count; i++)
   {
      if(i > 0) candlesJson += ",";
      string sampleTime = FormatIsoTime(rates[i].time);
      candlesJson += StringFormat(
         "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"time\":\"%s\",\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"tickVolume\":%d,\"realVolume\":%d,\"spread\":%d}",
         symbol,
         timeframe,
         sampleTime,
         rates[i].open,
         rates[i].high,
         rates[i].low,
         rates[i].close,
         rates[i].tick_volume,
         rates[i].real_volume,
         rates[i].spread
      );
   }
   candlesJson += "]";

   string payload = StringFormat("{\"terminalId\":\"%s\",\"jobId\":\"%s\",\"candles\":%s}", g_terminalId, jobId, candlesJson);
   string response;
   int status = HttpPost("/candles", payload, response);
   if(status != 200)
   {
      Print("[ReplayFX Sync] Candle upload failed: status=", status, " response=", response);
      return false;
   }
   Print("[ReplayFX Sync] Candle batch uploaded successfully for job=", jobId, " count=", count);
   return true;
}

bool ProcessCandleTask(string taskId, string symbol, string timeframe, datetime dateFrom, datetime dateTo)
{
   Print("[ReplayFX Sync] Starting candle task ", taskId, " symbol=", symbol, " timeframe=", timeframe, " from=", FormatIsoTime(dateFrom), " to=", FormatIsoTime(dateTo));
   ENUM_TIMEFRAMES tfEnum = GetTimeframeEnum(timeframe);
   if(tfEnum == PERIOD_CURRENT)
   {
      Print("[ReplayFX Sync] Unsupported timeframe: ", timeframe);
      return false;
   }

   datetime cursor = dateFrom;
   int stepSeconds = GetTimeframeSeconds(timeframe);
   const int batchSize = 500;
   MqlRates rates[];

   while(cursor < dateTo)
   {
      ArrayResize(rates, batchSize);
      int count = CopyRates(symbol, tfEnum, cursor, dateTo, rates);
      if(count <= 0)
      {
         Print("[ReplayFX Sync] No candle data returned from CopyRates for ", symbol, " ", timeframe, " from ", FormatIsoTime(cursor), " to ", FormatIsoTime(dateTo));
         return false;
      }

      Print("[ReplayFX Sync] Retrieved ", count, " candles from MT5 for task=", taskId, " cursor=", FormatIsoTime(cursor));
      if(!SendCandlesBatch(taskId, symbol, timeframe, rates, count))
      {
         return false;
      }

      datetime lastTime = rates[count - 1].time;
      if(lastTime >= dateTo) break;
      if(lastTime < cursor) break;
      cursor = lastTime + stepSeconds;
      Sleep(500);
   }

   Print("[ReplayFX Sync] Candle task completed: ", taskId, " ", symbol, " ", timeframe);
   return true;
}

int InpTaskPollSec = 10;
datetime g_lastTaskCheck = 0;
bool     g_isDownloadingMarketData = false;

void CheckMarketDataTask()
{
   datetime now = TimeCurrent();
   if(now - g_lastHeartbeat >= InpHeartbeatSec)
   {
      SendHeartbeat();
   }

   if(!InpSyncMarketData)
   {
      Print("[ReplayFX Sync] Market data sync disabled; skipping task check.");
      return;
   }
   if(g_isDownloadingMarketData)
   {
      Print("[ReplayFX Sync] Already downloading market data; skipping task check.");
      return;
   }
   if(now - g_lastTaskCheck < InpTaskPollSec)
   {
      int secondsRemaining = InpTaskPollSec - (int)(now - g_lastTaskCheck);
      if(secondsRemaining < 0) secondsRemaining = 0;
      Print("[ReplayFX Sync] Task poll interval not reached; next check in ", secondsRemaining, "s.");
      return;
   }

   g_lastTaskCheck = now;
   Print("[ReplayFX Sync] Polling next market data task...");
   string taskResponse;
   if(RequestNextTask(taskResponse))
   {
      string taskId, symbol, dataType, timeframe;
      datetime dateFrom, dateTo;
      if(ParseTask(taskResponse, taskId, symbol, dataType, timeframe, dateFrom, dateTo))
      {
         Print("[ReplayFX Sync] Received market data task: ", taskId, " symbol=", symbol, " dataType=", dataType, " timeframe=", timeframe, " from=", FormatIsoTime(dateFrom), " to=", FormatIsoTime(dateTo));
         g_isDownloadingMarketData = true;
         if(StringCompare(dataType, "CANDLE") == 0)
         {
            ProcessCandleTask(taskId, symbol, timeframe, dateFrom, dateTo);
         }
         else if(StringCompare(dataType, "TICK") == 0)
         {
            Print("[ReplayFX Sync] Tick task support is not implemented yet.");
         }
         else
         {
            Print("[ReplayFX Sync] Unsupported market data task type: ", dataType);
         }
         g_isDownloadingMarketData = false;
      }
      else
      {
         Print("[ReplayFX Sync] No market data task available or failed to parse.");
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

      // Send in batches of 200
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
   Print("[ReplayFX Sync] Initializing ReplayFX Native Sync EA v3.00...");
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
   Print("[ReplayFX Sync] OnTimer fired");
   CheckMarketDataTask();
}

//+------------------------------------------------------------------+
//| Expert tick function fallback for task checking                  |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!InpSyncMarketData) return;
   if(TimeCurrent() - g_lastTaskCheck < InpTaskPollSec) return;
   Print("[ReplayFX Sync] OnTick fallback attempting task check");
   CheckMarketDataTask();
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
      ulong positionId = trans.position;
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      long entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);

      string status = (entryType == DEAL_ENTRY_IN) ? "OPEN" : "CLOSED";

      string payload = StringFormat(
         "{\"terminalId\":\"%s\",\"accountNumber\":\"%d\",\"positionId\":\"%llu\",\"dealId\":\"%llu\",\"symbol\":\"%s\",\"side\":\"%s\",\"lot\":%.2f,\"entryPrice\":%.5f,\"closePrice\":%.5f,\"status\":\"%s\",\"profit\":%.2f,\"openTime\":\"%s\"}",
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
