#property strict

enum ENUM_REPLAYFX_MODE
{
   REPLAYFX_AUTO = 0,
   REPLAYFX_NOTIFY_ONLY = 1,
   REPLAYFX_APPROVAL_REQUIRED = 2,
   REPLAYFX_PAUSED = 3
};

struct ReplayFXSignal
{
   string eaName;
   string symbol;
   string timeframe;
   string side;
   double entry;
   double sl;
   double tp;
   double rr;
   double riskPercent;
   double lot;
   string reason;
   string screenshotPath;
   int timeoutSeconds;
};

string ReplayFXBackendURL = "http://127.0.0.1:5000";
string ReplayFXSecretToken = "replayfx_secret_token_123";
string ReplayFXTerminalId = "";
string ReplayFXInstanceId = "";
string ReplayFXEAName = "ReplayFX EA";
string ReplayFXEAFileName = "";
ENUM_REPLAYFX_MODE ReplayFXMode = REPLAYFX_NOTIFY_ONLY;
int ReplayFXPollSeconds = 10;
bool ReplayFXTakeScreenshotOnSignal = true;
int ReplayFXPanelWidth = 360;
bool ReplayFXAllowRemoteConfig = true;

double ReplayFXCfgRiskPercent = 0.0;
double ReplayFXCfgRR = 0.0;
bool ReplayFXCfgAllowBuy = true;
bool ReplayFXCfgAllowSell = true;
double ReplayFXCfgMaxSpread = 0.0;
double ReplayFXCfgMaxDailyLoss = 0.0;
int ReplayFXCfgMaxTradesPerDay = 0;
bool ReplayFXCfgCompactPanel = false;
bool ReplayFXCfgShowZones = true;
bool ReplayFXCfgShowStats = true;
bool ReplayFXCfgUseSpreadFilter = false;
string ReplayFXCfgEntryMode = "";
int ReplayFXCfgLookback = 0;
double ReplayFXCfgBreakBufferPips = 0.0;
double ReplayFXCfgManualSLPips = 0.0;
bool ReplayFXCfgOnePositionOnly = true;
bool ReplayFXCfgOneEntryPerBar = true;
double ReplayFXCfgLot = 0.0;
double ReplayFXCfgGridDistance = 0.0;
double ReplayFXCfgGridDistancePips = 0.0;
int ReplayFXCfgLayers = 0;
double ReplayFXCfgMultiplier = 0.0;
double ReplayFXCfgMaxFloatingLoss = 0.0;
double ReplayFXCfgTargetProfit = 0.0;
double ReplayFXCfgMinBodyPips = 0.0;
double ReplayFXCfgMinBodyPercent = 0.0;
bool ReplayFXCfgAtrFilter = false;
bool ReplayFXCfgShowPanel = true;
bool ReplayFXCfgSkipSideways = true;
int ReplayFXCfgATRPeriod = 0;
int ReplayFXCfgDeviationPoints = 0;
int ReplayFXCfgPanelX = 0;
int ReplayFXCfgPanelY = 0;
datetime ReplayFXLastConfigAt = 0;
datetime ReplayFXLastHeartbeatAt = 0;
string ReplayFXLastApprovalStatus = "";
string ReplayFXLastSignalId = "";
string ReplayFXConfigVersion = "1";

string ReplayFX_ModeToString(ENUM_REPLAYFX_MODE mode)
{
   if(mode == REPLAYFX_AUTO) return "AUTO";
   if(mode == REPLAYFX_NOTIFY_ONLY) return "NOTIFY_ONLY";
   if(mode == REPLAYFX_APPROVAL_REQUIRED) return "APPROVAL_REQUIRED";
   if(mode == REPLAYFX_PAUSED) return "PAUSED";
   return "NOTIFY_ONLY";
}

ENUM_REPLAYFX_MODE ReplayFX_ModeFromString(string mode)
{
   StringToUpper(mode);
   if(mode == "AUTO") return REPLAYFX_AUTO;
   if(mode == "APPROVAL" || mode == "APPROVAL_REQUIRED") return REPLAYFX_APPROVAL_REQUIRED;
   if(mode == "PAUSED") return REPLAYFX_PAUSED;
   return REPLAYFX_NOTIFY_ONLY;
}

string ReplayFX_EscapeJson(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   return value;
}

string ReplayFX_JsonString(string key, string value)
{
   return "\"" + key + "\":\"" + ReplayFX_EscapeJson(value) + "\"";
}

string ReplayFX_JsonNumber(string key, double value, int digits = 2)
{
   return "\"" + key + "\":" + DoubleToString(value, digits);
}

string ReplayFX_JsonBool(string key, bool value)
{
   return "\"" + key + "\":" + (value ? "true" : "false");
}

string ReplayFX_CurrentConfigJson()
{
   string json = "{";
   json += ReplayFX_JsonString("mode", ReplayFX_ModeToString(ReplayFXMode)) + ",";
   json += ReplayFX_JsonNumber("riskPercent", ReplayFXCfgRiskPercent, 2) + ",";
   json += ReplayFX_JsonNumber("rr", ReplayFXCfgRR, 2) + ",";
   json += ReplayFX_JsonBool("allowBuy", ReplayFXCfgAllowBuy) + ",";
   json += ReplayFX_JsonBool("allowSell", ReplayFXCfgAllowSell) + ",";
   json += ReplayFX_JsonNumber("maxSpread", ReplayFXCfgMaxSpread, 2) + ",";
   json += ReplayFX_JsonNumber("maxDailyLoss", ReplayFXCfgMaxDailyLoss, 2) + ",";
   json += "\"maxTradesPerDay\":" + IntegerToString(ReplayFXCfgMaxTradesPerDay) + ",";
   json += ReplayFX_JsonBool("takeScreenshotOnSignal", ReplayFXTakeScreenshotOnSignal) + ",";
   json += "\"panelWidth\":" + IntegerToString(ReplayFXPanelWidth) + ",";
   json += ReplayFX_JsonBool("compactPanel", ReplayFXCfgCompactPanel) + ",";
   json += ReplayFX_JsonBool("showZones", ReplayFXCfgShowZones) + ",";
   json += ReplayFX_JsonBool("showStats", ReplayFXCfgShowStats) + ",";
   json += ReplayFX_JsonBool("useSpreadFilter", ReplayFXCfgUseSpreadFilter) + ",";
   json += ReplayFX_JsonString("entryMode", ReplayFXCfgEntryMode) + ",";
   json += "\"lookback\":" + IntegerToString(ReplayFXCfgLookback) + ",";
   json += ReplayFX_JsonNumber("breakBufferPips", ReplayFXCfgBreakBufferPips, 2) + ",";
   json += ReplayFX_JsonNumber("manualSLPips", ReplayFXCfgManualSLPips, 2) + ",";
   json += ReplayFX_JsonBool("onePositionOnly", ReplayFXCfgOnePositionOnly) + ",";
   json += ReplayFX_JsonBool("oneEntryPerBar", ReplayFXCfgOneEntryPerBar) + ",";
   json += ReplayFX_JsonNumber("lot", ReplayFXCfgLot, 2) + ",";
   json += ReplayFX_JsonNumber("gridDistance", ReplayFXCfgGridDistance, 2) + ",";
   json += ReplayFX_JsonNumber("gridDistancePips", ReplayFXCfgGridDistancePips, 2) + ",";
   json += "\"layers\":" + IntegerToString(ReplayFXCfgLayers) + ",";
   json += ReplayFX_JsonNumber("multiplier", ReplayFXCfgMultiplier, 2) + ",";
   json += ReplayFX_JsonNumber("maxFloatingLoss", ReplayFXCfgMaxFloatingLoss, 2) + ",";
   json += ReplayFX_JsonNumber("targetProfit", ReplayFXCfgTargetProfit, 2) + ",";
   json += ReplayFX_JsonNumber("minBodyPips", ReplayFXCfgMinBodyPips, 2) + ",";
   json += ReplayFX_JsonNumber("minBodyPercent", ReplayFXCfgMinBodyPercent, 2) + ",";
   json += ReplayFX_JsonBool("atrFilter", ReplayFXCfgAtrFilter) + ",";
   json += ReplayFX_JsonBool("showPanel", ReplayFXCfgShowPanel) + ",";
   json += ReplayFX_JsonBool("skipSideways", ReplayFXCfgSkipSideways) + ",";
   json += "\"atrPeriod\":" + IntegerToString(ReplayFXCfgATRPeriod) + ",";
   json += "\"deviationPoints\":" + IntegerToString(ReplayFXCfgDeviationPoints) + ",";
   json += "\"panelX\":" + IntegerToString(ReplayFXCfgPanelX) + ",";
   json += "\"panelY\":" + IntegerToString(ReplayFXCfgPanelY);
   json += "}";
   return json;
}

string ReplayFX_ConfigSchemaJson()
{
   return "["
      "{\"key\":\"mode\",\"type\":\"mode\",\"label\":\"Mode\"},"
      "{\"key\":\"riskPercent\",\"type\":\"number\",\"label\":\"Risk Percent\"},"
      "{\"key\":\"rr\",\"type\":\"number\",\"label\":\"RR\"},"
      "{\"key\":\"lot\",\"type\":\"number\",\"label\":\"Lot\"},"
      "{\"key\":\"gridDistancePips\",\"type\":\"number\",\"label\":\"Grid Distance Pips\"},"
      "{\"key\":\"layers\",\"type\":\"number\",\"label\":\"Layers\"},"
      "{\"key\":\"allowBuy\",\"type\":\"boolean\",\"label\":\"Allow Buy\"},"
      "{\"key\":\"allowSell\",\"type\":\"boolean\",\"label\":\"Allow Sell\"},"
      "{\"key\":\"maxSpread\",\"type\":\"number\",\"label\":\"Max Spread\"},"
      "{\"key\":\"takeScreenshotOnSignal\",\"type\":\"boolean\",\"label\":\"Signal Screenshot\"},"
      "{\"key\":\"panelWidth\",\"type\":\"number\",\"label\":\"Panel Width\"}"
      "]";
}

void ReplayFX_LogHttpFailure(string method, string endpoint, int httpStatus, string response, int lastError, int payloadLength)
{
   Print("ReplayFX HTTP diagnostic method=", method,
         " endpoint=", endpoint,
         " httpStatus=", IntegerToString(httpStatus),
         " response=", response,
         " lastError=", IntegerToString(lastError),
         " payloadLength=", IntegerToString(payloadLength),
         " tokenPresent=", (ReplayFXSecretToken == "" ? "false" : "true"));
}

string ReplayFX_TimeframeToString(ENUM_TIMEFRAMES tf)
{
   switch(tf)
   {
      case PERIOD_M1: return "M1";
      case PERIOD_M2: return "M2";
      case PERIOD_M3: return "M3";
      case PERIOD_M4: return "M4";
      case PERIOD_M5: return "M5";
      case PERIOD_M6: return "M6";
      case PERIOD_M10: return "M10";
      case PERIOD_M12: return "M12";
      case PERIOD_M15: return "M15";
      case PERIOD_M20: return "M20";
      case PERIOD_M30: return "M30";
      case PERIOD_H1: return "H1";
      case PERIOD_H2: return "H2";
      case PERIOD_H3: return "H3";
      case PERIOD_H4: return "H4";
      case PERIOD_H6: return "H6";
      case PERIOD_H8: return "H8";
      case PERIOD_H12: return "H12";
      case PERIOD_D1: return "D1";
      case PERIOD_W1: return "W1";
      case PERIOD_MN1: return "MN1";
      default: return IntegerToString((int)tf);
   }
}

ENUM_TIMEFRAMES ReplayFX_TimeframeFromString(string value)
{
   StringToUpper(value);
   if(value == "M1") return PERIOD_M1;
   if(value == "M2") return PERIOD_M2;
   if(value == "M3") return PERIOD_M3;
   if(value == "M4") return PERIOD_M4;
   if(value == "M5") return PERIOD_M5;
   if(value == "M6") return PERIOD_M6;
   if(value == "M10") return PERIOD_M10;
   if(value == "M12") return PERIOD_M12;
   if(value == "M15") return PERIOD_M15;
   if(value == "M20") return PERIOD_M20;
   if(value == "M30") return PERIOD_M30;
   if(value == "H1") return PERIOD_H1;
   if(value == "H2") return PERIOD_H2;
   if(value == "H3") return PERIOD_H3;
   if(value == "H4") return PERIOD_H4;
   if(value == "H6") return PERIOD_H6;
   if(value == "H8") return PERIOD_H8;
   if(value == "H12") return PERIOD_H12;
   if(value == "D1") return PERIOD_D1;
   if(value == "W1") return PERIOD_W1;
   if(value == "MN1") return PERIOD_MN1;
   return PERIOD_CURRENT;
}

int ReplayFX_CountCharts()
{
   int count = 0;
   long id = ChartFirst();
   long lastId = -1;
   while(id >= 0 && id != lastId)
   {
      count++;
      lastId = id;
      id = ChartNext(id);
   }
   return count;
}

int ReplayFX_StringToUtf8Body(string text, char &data[])
{
   ArrayResize(data, 0);
   if(text == "")
      return 0;

   int size = StringToCharArray(text, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(size <= 0)
   {
      ArrayResize(data, 0);
      return 0;
   }

   int n = ArraySize(data);
   while(n > 0 && data[n - 1] == 0)
      n--;

   ArrayResize(data, n);
   return n;
}

void ReplayFX_Init(string backendUrl,
                   string secretToken,
                   string terminalId,
                   string instanceId,
                   string eaName,
                   ENUM_REPLAYFX_MODE mode,
                   int pollSeconds,
                   bool takeScreenshotOnSignal,
                   int panelWidth,
                   bool allowRemoteConfig)
{
   ReplayFXBackendURL = backendUrl;
   ReplayFXSecretToken = secretToken;
   ReplayFXTerminalId = terminalId;
   ReplayFXInstanceId = instanceId;
   ReplayFXEAName = eaName;
   ReplayFXMode = mode;
   ReplayFXPollSeconds = MathMax(2, pollSeconds);
   ReplayFXTakeScreenshotOnSignal = takeScreenshotOnSignal;
   ReplayFXPanelWidth = panelWidth;
   ReplayFXAllowRemoteConfig = allowRemoteConfig;
   if(ReplayFXTerminalId == "")
      ReplayFXTerminalId = "ReplayFX-MT5-" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   Print("ReplayFX SDK initialized. backend=", ReplayFXBackendURL, " terminal=", ReplayFXTerminalId, " instance=", ReplayFXInstanceId, " mode=", ReplayFX_ModeToString(ReplayFXMode));
}

bool ReplayFX_WebRequestJson(string method, string endpoint, string jsonBody, string &response, int &httpStatus)
{
   response = "";
   httpStatus = 0;
   string url = ReplayFXBackendURL + endpoint;
   string headers = "Content-Type: application/json\r\n";
   headers += "Authorization: Bearer " + ReplayFXSecretToken + "\r\n";
   if(ReplayFXSecretToken == "")
      Print("ReplayFX auth warning: token is empty. Set InpReplayFXSecretToken / ReplayFX_SecretToken to the backend secret.");
   char data[];
   char result[];
   string resultHeaders = "";
   int payloadLength = ReplayFX_StringToUtf8Body(jsonBody, data);
   ResetLastError();
   int status = WebRequest(method, url, headers, 8000, data, result, resultHeaders);
   if(status == -1)
   {
      int err = GetLastError();
      ReplayFX_LogHttpFailure(method, endpoint, -1, "", err, payloadLength);
      Print("ReplayFX WebRequest failed. Add URL in MT5: Tools > Options > Expert Advisors > Allow WebRequest: ", ReplayFXBackendURL);
      return false;
   }
   httpStatus = status;
   int resultLen = ArraySize(result);
   if(resultLen > 0)
   {
      ArrayResize(result, resultLen + 1);
      result[resultLen] = 0;
      response = CharArrayToString(result, 0, resultLen, CP_UTF8);
   }
   else
   {
      response = "";
   }
   if(status >= 200 && status < 300)
   {
      Print("ReplayFX HTTP ", status, " OK ", endpoint, " response=", response);
      return true;
   }
   ReplayFX_LogHttpFailure(method, endpoint, status, response, GetLastError(), payloadLength);
   return false;
}

bool ReplayFX_WebRequestGet(string endpoint, string &response, int &httpStatus)
{
   response = "";
   httpStatus = 0;
   string url = ReplayFXBackendURL + endpoint;
   string headers = "Authorization: Bearer " + ReplayFXSecretToken + "\r\n";
   if(ReplayFXSecretToken == "")
      Print("ReplayFX auth warning: token is empty. Set InpReplayFXSecretToken / ReplayFX_SecretToken to the backend secret.");
   char data[];
   ArrayResize(data, 0);
   char result[];
   string resultHeaders = "";
   ResetLastError();
   int status = WebRequest("GET", url, headers, 8000, data, result, resultHeaders);
   if(status == -1)
   {
      int err = GetLastError();
      ReplayFX_LogHttpFailure("GET", endpoint, -1, "", err, 0);
      Print("ReplayFX GET failed. Add WebRequest URL: ", ReplayFXBackendURL);
      return false;
   }
   httpStatus = status;
   int resultLen = ArraySize(result);
   if(resultLen > 0)
   {
      ArrayResize(result, resultLen + 1);
      result[resultLen] = 0;
      response = CharArrayToString(result, 0, resultLen, CP_UTF8);
   }
   else
   {
      response = "";
   }
   if(status >= 200 && status < 300)
   {
      Print("ReplayFX HTTP ", status, " OK ", endpoint, " response=", response);
      return true;
   }
   ReplayFX_LogHttpFailure("GET", endpoint, status, response, GetLastError(), 0);
   return false;
}

string ReplayFX_ReadJsonString(string json, string key, string fallback = "")
{
   string marker = "\"" + key + "\":";
   int p = StringFind(json, marker);
   if(p < 0) return fallback;
   p += StringLen(marker);
   while(p < StringLen(json) && StringGetCharacter(json, p) == ' ') p++;
   if(p >= StringLen(json) || StringGetCharacter(json, p) != 34) return fallback;
   p++;
   int e = p;
   while(e < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, e);
      if(ch == 34) break;
      if(ch == 92 && e + 1 < StringLen(json))
      {
         e += 2;
         continue;
      }
      e++;
   }
   if(e <= p) return fallback;
   return StringSubstr(json, p, e - p);
}

double ReplayFX_ReadJsonDouble(string json, string key, double fallback = 0.0)
{
   string marker = "\"" + key + "\":";
   int p = StringFind(json, marker);
   if(p < 0) return fallback;
   p += StringLen(marker);
   while(p < StringLen(json) && StringGetCharacter(json, p) == ' ') p++;
   int e = p;
   while(e < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, e);
      if((ch >= '0' && ch <= '9') || ch == '-' || ch == '+' || ch == '.') e++;
      else break;
   }
   if(e <= p) return fallback;
   return StringToDouble(StringSubstr(json, p, e - p));
}

bool ReplayFX_ReadJsonBool(string json, string key, bool fallback)
{
   string marker = "\"" + key + "\":";
   int p = StringFind(json, marker);
   if(p < 0) return fallback;
   p += StringLen(marker);
   while(p < StringLen(json) && StringGetCharacter(json, p) == ' ') p++;
   string tail = StringSubstr(json, p, 5);
   StringToLower(tail);
   if(StringFind(tail, "true") == 0) return true;
   if(StringFind(tail, "false") == 0) return false;
   return fallback;
}

bool ReplayFX_SendHeartbeat(string status = "ONLINE")
{
   string payload = "{";
   payload += ReplayFX_JsonString("terminalId", ReplayFXTerminalId) + ",";
   payload += ReplayFX_JsonString("accountNumber", IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))) + ",";
   payload += ReplayFX_JsonString("broker", AccountInfoString(ACCOUNT_COMPANY)) + ",";
   payload += ReplayFX_JsonString("server", AccountInfoString(ACCOUNT_SERVER)) + ",";
   payload += ReplayFX_JsonString("eaName", ReplayFXEAName) + ",";
   if(ReplayFXEAFileName != "") payload += ReplayFX_JsonString("fileName", ReplayFXEAFileName) + ",";
   payload += ReplayFX_JsonString("symbol", _Symbol) + ",";
   payload += ReplayFX_JsonString("timeframe", ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)_Period)) + ",";
   payload += ReplayFX_JsonString("chartId", IntegerToString((int)ChartID())) + ",";
   payload += ReplayFX_JsonString("instanceId", ReplayFXInstanceId) + ",";
   payload += ReplayFX_JsonString("mode", ReplayFX_ModeToString(ReplayFXMode)) + ",";
   payload += ReplayFX_JsonString("status", status) + ",";
   payload += ReplayFX_JsonNumber("balance", AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   payload += ReplayFX_JsonNumber("equity", AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   payload += ReplayFX_JsonNumber("freeMargin", AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   payload += "\"currentConfig\":" + ReplayFX_CurrentConfigJson() + ",";
   payload += "\"configSchema\":" + ReplayFX_ConfigSchemaJson() + ",";
   payload += ReplayFX_JsonString("configVersion", ReplayFXConfigVersion) + ",";
   payload += "\"activeChartCount\":" + IntegerToString(ReplayFX_CountCharts()) + ",";
   payload += ReplayFX_JsonString("timestamp", TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));
   payload += "}";
   string response;
   int httpStatus;
   bool ok = ReplayFX_WebRequestJson("POST", "/api/ea-control/heartbeat", payload, response, httpStatus);
   if(ok) ReplayFXLastHeartbeatAt = TimeCurrent();
   return ok;
}

bool ReplayFX_LoadConfig()
{
   if(!ReplayFXAllowRemoteConfig) return false;
   string endpoint = "/api/ea-control/config?terminalId=" + ReplayFXTerminalId + "&instanceId=" + ReplayFXInstanceId;
   string response;
   int httpStatus;
   if(!ReplayFX_WebRequestGet(endpoint, response, httpStatus)) return false;
   ReplayFXConfigVersion = ReplayFX_ReadJsonString(response, "configVersion", ReplayFXConfigVersion);
   string mode = ReplayFX_ReadJsonString(response, "mode", ReplayFX_ModeToString(ReplayFXMode));
   ReplayFXMode = ReplayFX_ModeFromString(mode);
   ReplayFXCfgRiskPercent = ReplayFX_ReadJsonDouble(response, "riskPercent", ReplayFXCfgRiskPercent);
   ReplayFXCfgRR = ReplayFX_ReadJsonDouble(response, "rr", ReplayFXCfgRR);
   ReplayFXCfgAllowBuy = ReplayFX_ReadJsonBool(response, "allowBuy", ReplayFXCfgAllowBuy);
   ReplayFXCfgAllowSell = ReplayFX_ReadJsonBool(response, "allowSell", ReplayFXCfgAllowSell);
   ReplayFXCfgMaxSpread = ReplayFX_ReadJsonDouble(response, "maxSpread", ReplayFXCfgMaxSpread);
   ReplayFXCfgMaxDailyLoss = ReplayFX_ReadJsonDouble(response, "maxDailyLoss", ReplayFXCfgMaxDailyLoss);
   ReplayFXCfgMaxTradesPerDay = (int)ReplayFX_ReadJsonDouble(response, "maxTradesPerDay", ReplayFXCfgMaxTradesPerDay);
   ReplayFXTakeScreenshotOnSignal = ReplayFX_ReadJsonBool(response, "takeScreenshotOnSignal", ReplayFXTakeScreenshotOnSignal);
   ReplayFXPanelWidth = (int)ReplayFX_ReadJsonDouble(response, "panelWidth", ReplayFXPanelWidth);
   ReplayFXCfgCompactPanel = ReplayFX_ReadJsonBool(response, "compactPanel", ReplayFXCfgCompactPanel);
   ReplayFXCfgShowZones = ReplayFX_ReadJsonBool(response, "showZones", ReplayFXCfgShowZones);
   ReplayFXCfgShowStats = ReplayFX_ReadJsonBool(response, "showStats", ReplayFXCfgShowStats);
   ReplayFXCfgUseSpreadFilter = ReplayFX_ReadJsonBool(response, "useSpreadFilter", ReplayFXCfgUseSpreadFilter);
   ReplayFXCfgEntryMode = ReplayFX_ReadJsonString(response, "entryMode", ReplayFXCfgEntryMode);
   ReplayFXCfgLookback = (int)ReplayFX_ReadJsonDouble(response, "lookback", ReplayFXCfgLookback);
   ReplayFXCfgBreakBufferPips = ReplayFX_ReadJsonDouble(response, "breakBufferPips", ReplayFXCfgBreakBufferPips);
   ReplayFXCfgManualSLPips = ReplayFX_ReadJsonDouble(response, "manualSLPips", ReplayFXCfgManualSLPips);
   ReplayFXCfgOnePositionOnly = ReplayFX_ReadJsonBool(response, "onePositionOnly", ReplayFXCfgOnePositionOnly);
   ReplayFXCfgOneEntryPerBar = ReplayFX_ReadJsonBool(response, "oneEntryPerBar", ReplayFXCfgOneEntryPerBar);
   ReplayFXCfgLot = ReplayFX_ReadJsonDouble(response, "lot", ReplayFXCfgLot);
   ReplayFXCfgGridDistance = ReplayFX_ReadJsonDouble(response, "gridDistance", ReplayFXCfgGridDistance);
   ReplayFXCfgGridDistancePips = ReplayFX_ReadJsonDouble(response, "gridDistancePips", ReplayFXCfgGridDistancePips);
   ReplayFXCfgLayers = (int)ReplayFX_ReadJsonDouble(response, "layers", ReplayFXCfgLayers);
   ReplayFXCfgMultiplier = ReplayFX_ReadJsonDouble(response, "multiplier", ReplayFXCfgMultiplier);
   ReplayFXCfgMaxFloatingLoss = ReplayFX_ReadJsonDouble(response, "maxFloatingLoss", ReplayFXCfgMaxFloatingLoss);
   ReplayFXCfgTargetProfit = ReplayFX_ReadJsonDouble(response, "targetProfit", ReplayFXCfgTargetProfit);
   ReplayFXCfgMinBodyPips = ReplayFX_ReadJsonDouble(response, "minBodyPips", ReplayFXCfgMinBodyPips);
   ReplayFXCfgMinBodyPercent = ReplayFX_ReadJsonDouble(response, "minBodyPercent", ReplayFXCfgMinBodyPercent);
   ReplayFXCfgAtrFilter = ReplayFX_ReadJsonBool(response, "atrFilter", ReplayFXCfgAtrFilter);
   ReplayFXCfgShowPanel = ReplayFX_ReadJsonBool(response, "showPanel", ReplayFXCfgShowPanel);
   ReplayFXCfgSkipSideways = ReplayFX_ReadJsonBool(response, "skipSideways", ReplayFX_ReadJsonBool(response, "InpSkipSideways", ReplayFXCfgSkipSideways));
   ReplayFXCfgATRPeriod = (int)ReplayFX_ReadJsonDouble(response, "atrPeriod", ReplayFX_ReadJsonDouble(response, "InpATRPeriod", ReplayFXCfgATRPeriod));
   ReplayFXCfgDeviationPoints = (int)ReplayFX_ReadJsonDouble(response, "deviationPoints", ReplayFX_ReadJsonDouble(response, "InpDeviationPoints", ReplayFXCfgDeviationPoints));
   ReplayFXCfgPanelX = (int)ReplayFX_ReadJsonDouble(response, "panelX", ReplayFX_ReadJsonDouble(response, "InpPanelX", ReplayFXCfgPanelX));
   ReplayFXCfgPanelY = (int)ReplayFX_ReadJsonDouble(response, "panelY", ReplayFX_ReadJsonDouble(response, "InpPanelY", ReplayFXCfgPanelY));
   ReplayFXLastConfigAt = TimeCurrent();
   Print("ReplayFX heartbeat currentConfig mode=", ReplayFX_ModeToString(ReplayFXMode),
         " configVersion=", ReplayFXConfigVersion,
         " panelWidth=", IntegerToString(ReplayFXPanelWidth),
         " showPanel=", (ReplayFXCfgShowPanel ? "true" : "false"));
   return true;
}

bool ReplayFX_TakeChartScreenshot(long chartId, string filename, int width = 1280, int height = 720)
{
   ResetLastError();
   bool ok = ChartScreenShot(chartId, filename, width, height, ALIGN_RIGHT);
   if(!ok) Print("ReplayFX screenshot failed: ", GetLastError());
   return ok;
}

bool ReplayFX_TakeScreenshot(string filename, int width = 1280, int height = 720)
{
   return ReplayFX_TakeChartScreenshot(ChartID(), filename, width, height);
}

bool ReplayFX_SendBasicEvent(string eventType, string message)
{
   string payload = "{";
   payload += ReplayFX_JsonString("terminalId", ReplayFXTerminalId) + ",";
   payload += ReplayFX_JsonString("instanceId", ReplayFXInstanceId) + ",";
   payload += ReplayFX_JsonString("eventType", eventType) + ",";
   payload += ReplayFX_JsonString("message", message);
   payload += "}";
   string response;
   int httpStatus;
   return ReplayFX_WebRequestJson("POST", "/api/ea-control/events", payload, response, httpStatus);
}

bool ReplayFX_CheckSignalStatus(string signalId)
{
   string response;
   int httpStatus;
   if(!ReplayFX_WebRequestGet("/api/ea-control/signals/" + signalId + "/status", response, httpStatus))
   {
      ReplayFXLastApprovalStatus = "OFFLINE";
      return false;
   }
   string status = ReplayFX_ReadJsonString(response, "status", "PENDING");
   StringToUpper(status);
   ReplayFXLastApprovalStatus = status;
   if(status == "APPROVED") return true;
   if(status == "EXECUTED" || status == "FAILED" || status == "REJECTED" || status == "EXPIRED" || status == "CANCELLED")
      return false;
   return false;
}

bool ReplayFX_WaitForApproval(string signalId, int timeoutSeconds)
{
   ReplayFXLastSignalId = signalId;
   ReplayFXLastApprovalStatus = "PENDING";
   datetime started = TimeCurrent();
   while(TimeCurrent() - started < timeoutSeconds)
   {
      Print("ReplayFX approval waiting. signalId=", signalId, " status=", ReplayFXLastApprovalStatus);
      if(ReplayFX_CheckSignalStatus(signalId)) return true;
      if(ReplayFXLastApprovalStatus == "REJECTED" || ReplayFXLastApprovalStatus == "EXPIRED" || ReplayFXLastApprovalStatus == "OFFLINE") return false;
      Sleep(MathMax(1, ReplayFXPollSeconds) * 1000);
   }
   ReplayFXLastApprovalStatus = "EXPIRED";
   return false;
}

bool ReplayFX_SendSignal(ReplayFXSignal &signal, string &signalId)
{
   if(ReplayFXTakeScreenshotOnSignal && signal.screenshotPath == "")
   {
      signal.screenshotPath = "ReplayFX_" + ReplayFXEAName + "_" + _Symbol + "_" + IntegerToString((int)TimeCurrent()) + ".png";
      ReplayFX_TakeChartScreenshot(ChartID(), signal.screenshotPath, 1280, 720);
   }

   string payload = "{";
   payload += ReplayFX_JsonString("terminalId", ReplayFXTerminalId) + ",";
   payload += ReplayFX_JsonString("instanceId", ReplayFXInstanceId) + ",";
   payload += ReplayFX_JsonString("eaName", signal.eaName == "" ? ReplayFXEAName : signal.eaName) + ",";
   payload += ReplayFX_JsonString("symbol", signal.symbol == "" ? _Symbol : signal.symbol) + ",";
   payload += ReplayFX_JsonString("timeframe", signal.timeframe == "" ? ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)_Period) : signal.timeframe) + ",";
   payload += ReplayFX_JsonString("side", signal.side) + ",";
   payload += ReplayFX_JsonNumber("entry", signal.entry, _Digits) + ",";
   payload += ReplayFX_JsonNumber("sl", signal.sl, _Digits) + ",";
   payload += ReplayFX_JsonNumber("tp", signal.tp, _Digits) + ",";
   payload += ReplayFX_JsonNumber("rr", signal.rr, 2) + ",";
   payload += ReplayFX_JsonNumber("riskPercent", signal.riskPercent, 2) + ",";
   payload += ReplayFX_JsonNumber("lot", signal.lot, 2) + ",";
   payload += ReplayFX_JsonString("reason", signal.reason) + ",";
   payload += ReplayFX_JsonString("screenshotPath", signal.screenshotPath);
   payload += "}";

   string response;
   int httpStatus;
   bool posted = ReplayFX_WebRequestJson("POST", "/api/ea-control/signals", payload, response, httpStatus);
   if(!posted)
   {
      ReplayFXLastApprovalStatus = "OFFLINE";
      return false;
   }
   signalId = ReplayFX_ReadJsonString(response, "signalId", ReplayFX_ReadJsonString(response, "id", ""));
   ReplayFXLastSignalId = signalId;
   ReplayFXLastApprovalStatus = ReplayFX_ReadJsonString(response, "status", "PENDING");
   return (signalId != "");
}

bool ReplayFX_ResolveSignal(string signalId, string status, string note = "")
{
   if(signalId == "") signalId = ReplayFXLastSignalId;
   if(signalId == "") return false;

   StringToUpper(status);
   if(status != "EXECUTED" && status != "FAILED")
      status = "EXECUTED";

   string payload = "{";
   payload += ReplayFX_JsonString("terminalId", ReplayFXTerminalId) + ",";
   payload += ReplayFX_JsonString("instanceId", ReplayFXInstanceId) + ",";
   payload += ReplayFX_JsonString("signalId", signalId) + ",";
   payload += ReplayFX_JsonString("status", status) + ",";
   payload += ReplayFX_JsonString("note", note) + ",";
   payload += ReplayFX_JsonString("eaName", ReplayFXEAName) + ",";
   payload += ReplayFX_JsonString("symbol", _Symbol) + ",";
   payload += ReplayFX_JsonString("timeframe", ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)_Period)) + ",";
   payload += ReplayFX_JsonString("side", "");
   payload += "}";

   string response;
   int httpStatus;
   bool posted = ReplayFX_WebRequestJson("POST", "/api/ea-control/signals/" + signalId + "/resolve", payload, response, httpStatus);
   if(!posted)
   {
      ReplayFXLastApprovalStatus = "OFFLINE";
      return false;
   }

   ReplayFXLastApprovalStatus = ReplayFX_ReadJsonString(response, "status", status);
   return true;
}

bool ReplayFX_RequestApproval(ReplayFXSignal &signal)
{
   ReplayFXLastApprovalStatus = "";
   ReplayFXLastSignalId = "";

   if(ReplayFXMode == REPLAYFX_PAUSED)
   {
      ReplayFXLastApprovalStatus = "PAUSED";
      Print("ReplayFX mode PAUSED: entry skipped.");
      return false;
   }

   if(signal.side == "BUY" && !ReplayFXCfgAllowBuy)
   {
      ReplayFXLastApprovalStatus = "BUY_DISABLED";
      return false;
   }
   if(signal.side == "SELL" && !ReplayFXCfgAllowSell)
   {
      ReplayFXLastApprovalStatus = "SELL_DISABLED";
      return false;
   }

   string signalId = "";
   bool posted = ReplayFX_SendSignal(signal, signalId);

   if(ReplayFXMode == REPLAYFX_NOTIFY_ONLY)
   {
      if(!posted) Print("ReplayFX backend offline. Mode=NOTIFY_ONLY. Entry blocked.");
      ReplayFXLastApprovalStatus = posted ? "NOTIFIED_ONLY" : "OFFLINE";
      return false;
   }

   if(ReplayFXMode == REPLAYFX_AUTO)
   {
      if(!posted) Print("ReplayFX backend offline. Mode=", ReplayFX_ModeToString(ReplayFXMode), ". Entry decision is left to the EA.");
      ReplayFXLastApprovalStatus = posted ? "NOTIFIED" : "OFFLINE";
      return true;
   }

   if(!posted)
   {
      Print("ReplayFX APPROVAL_REQUIRED: backend offline or signal failed. Entry blocked.");
      ReplayFXLastApprovalStatus = "OFFLINE";
      return false;
   }

   if(signalId == "")
   {
      ReplayFXLastApprovalStatus = "NO_SIGNAL_ID";
      return false;
   }
   return ReplayFX_WaitForApproval(signalId, signal.timeoutSeconds > 0 ? signal.timeoutSeconds : 300);
}
