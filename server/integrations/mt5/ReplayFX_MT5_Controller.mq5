#property strict
#property version "1.22"
#property description "ReplayFX MT5 Controller. Safe remote chart/template/screenshot controller. No manual trading commands."

#include <ReplayFX_RemoteSDK.mqh>

input string InpReplayFXBackendURL = "http://127.0.0.1:5000";
input string InpReplayFXSecretToken = "replayfx_secret_token_123";
input string InpReplayFXTerminalId = "";
input int    InpHeartbeatSeconds = 10;
input int    InpMaxSymbols = 1000;

string ControllerTerminalId = "";
string ControllerLastPollAt = "";
string ControllerCurrentPickToken = "";

ENUM_TIMEFRAMES Controller_TimeframeFromString(string value)
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

string Controller_TemplateNameFromFileName(string fileName)
{
   if(fileName == "") return "";
   string name = StringSubstr(fileName, 0, StringLen(fileName) - 4);
   return name + ".tpl";
}

string Controller_NormalizeValue(string value)
{
   StringReplace(value, "\r", "");
   StringReplace(value, "\n", "");
   StringReplace(value, "\t", "");
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
}

string Controller_UpperValue(string value)
{
   string out = Controller_NormalizeValue(value);
   StringToUpper(out);
   return out;
}

string Controller_ReadLineValue(string text, string key, string fallback = "")
{
   string marker = key + "=";
   int p = StringFind(text, marker);
   if(p < 0) return fallback;
   p += StringLen(marker);
   int e = StringFind(text, "\n", p);
   if(e < 0) e = StringLen(text);
   string value = StringSubstr(text, p, e - p);
   return Controller_NormalizeValue(value);
}

bool Controller_IsSafeCommand(string commandType)
{
   commandType = Controller_NormalizeValue(commandType);
   StringToUpper(commandType);
   if(commandType == "BUY" || commandType == "SELL" || commandType == "CLOSE_ALL" || commandType == "MODIFY_SL" || commandType == "MODIFY_TP")
      return false;
   return commandType == "LIST_SYMBOLS" || commandType == "LIST_CHARTS" || commandType == "OPEN_CHART" || commandType == "APPLY_TEMPLATE" || commandType == "SCREENSHOT_CHART" ||
          commandType == "UPDATE_CONFIG" || commandType == "SET_MODE" || commandType == "PAUSE_EA" || commandType == "RESUME_EA" || commandType == "SELF_TEST_RESULT";
}

bool Controller_Report(string commandId, string status, string resultObjectJson)
{
   string payload = "{";
   payload += ReplayFX_JsonString("status", status) + ",";
   payload += ReplayFX_JsonString("pickToken", ControllerCurrentPickToken) + ",";
   payload += "\"result\":" + resultObjectJson;
   payload += "}";
   string response;
   int httpStatus;
   Print("ReplayFX ReportCommand START id=", commandId, " status=", status);
   Print("ReplayFX ReportCommand URL=", InpReplayFXBackendURL, "/api/ea-control/commands/", commandId, "/result");
   Print("ReplayFX ReportCommand payload=", payload);
   bool ok = ReplayFX_WebRequestJson("POST", "/api/ea-control/commands/" + commandId + "/result", payload, response, httpStatus);
   Print("ReplayFX ReportCommand HTTP=", IntegerToString(httpStatus), " ok=", (ok ? "true" : "false"), " response=", response);
   if(!ok)
   {
      int err = GetLastError();
      Print("ReplayFX RESULT REPORT FAILED id=", commandId, " HTTP=", IntegerToString(httpStatus), " response=", response, " lastError=", IntegerToString(err));
   }
   return ok;
}

string Controller_SymbolsJson()
{
   int total = SymbolsTotal(false);
   int limit = (int)MathMin(total, MathMax(1, InpMaxSymbols));
   string out = "{\"count\":" + IntegerToString(limit) + ",\"symbols\":[";
   for(int i = 0; i < limit; i++)
   {
      if(i > 0) out += ",";
      out += "\"" + ReplayFX_EscapeJson(SymbolName(i, false)) + "\"";
   }
   out += "]}";
   return out;
}

string Controller_ChartsJson()
{
   string out = "{\"charts\":[";
   int n = 0;
   long chartId = ChartFirst();
   long lastId = -1;
   while(chartId >= 0 && chartId != lastId)
   {
      if(n > 0) out += ",";
      out += "{";
      out += ReplayFX_JsonString("chartId", IntegerToString((int)chartId)) + ",";
      out += ReplayFX_JsonString("symbol", ChartSymbol(chartId)) + ",";
      out += ReplayFX_JsonString("timeframe", ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)ChartPeriod(chartId)));
      out += "}";
      n++;
      lastId = chartId;
      chartId = ChartNext(chartId);
   }
   out += "],\"count\":" + IntegerToString(n) + "}";
   return out;
}

bool Controller_StringStartsWith(string value, string prefix)
{
   if(prefix == "") return false;
   if(StringLen(value) < StringLen(prefix)) return false;
   return StringSubstr(value, 0, StringLen(prefix)) == prefix;
}

bool Controller_SymbolMatches(string candidate, string requested, bool startsOnly)
{
   string candidateUpper = Controller_UpperValue(candidate);
   string requestedUpper = Controller_UpperValue(requested);
   if(startsOnly) return Controller_StringStartsWith(candidateUpper, requestedUpper);
   return StringFind(candidateUpper, requestedUpper) >= 0;
}

string Controller_FindSymbolCandidate(string requestedSymbol, bool selectedOnly, bool startsOnly)
{
   int total = SymbolsTotal(selectedOnly);
   for(int i = 0; i < total; i++)
   {
      string candidate = SymbolName(i, selectedOnly);
      if(Controller_SymbolMatches(candidate, requestedSymbol, startsOnly))
         return candidate;
   }
   return "";
}

string Controller_ResolveBrokerSymbol(string requestedSymbol)
{
   requestedSymbol = Controller_NormalizeValue(requestedSymbol);
   if(requestedSymbol == "") return "";
   if((bool)SymbolInfoInteger(requestedSymbol, SYMBOL_EXIST))
      return requestedSymbol;

   string candidate = Controller_FindSymbolCandidate(requestedSymbol, true, true);
   if(candidate != "") return candidate;
   candidate = Controller_FindSymbolCandidate(requestedSymbol, true, false);
   if(candidate != "") return candidate;
   candidate = Controller_FindSymbolCandidate(requestedSymbol, false, true);
   if(candidate != "") return candidate;
   return Controller_FindSymbolCandidate(requestedSymbol, false, false);
}

bool Controller_SelectSymbolForChart(string resolvedSymbol)
{
   bool selected = SymbolSelect(resolvedSymbol, true);
   Sleep(500);
   return selected;
}

string Controller_SymbolSuggestionsJson(string requestedSymbol)
{
   string requestedUpper = Controller_UpperValue(requestedSymbol);
   string prefix = StringLen(requestedUpper) >= 3 ? StringSubstr(requestedUpper, 0, 3) : requestedUpper;
   string out = "[";
   int count = 0;

   for(int pass = 0; pass < 2 && count < 10; pass++)
   {
      bool selectedOnly = pass == 0;
      int total = SymbolsTotal(selectedOnly);
      for(int i = 0; i < total && count < 10; i++)
      {
         string candidate = SymbolName(i, selectedOnly);
         string candidateUpper = Controller_UpperValue(candidate);
         bool close = prefix != "" && StringFind(candidateUpper, prefix) >= 0;
         if(!close && requestedUpper != "")
            close = StringSubstr(candidateUpper, 0, 1) == StringSubstr(requestedUpper, 0, 1);
         if(!close) continue;
         if(count > 0) out += ",";
         out += "\"" + ReplayFX_EscapeJson(candidate) + "\"";
         count++;
      }
   }

   out += "]";
   return out;
}

long Controller_FindChart(string symbol, ENUM_TIMEFRAMES timeframe, long excludeChartId = 0)
{
   long chartId = ChartFirst();
   long lastId = -1;
   while(chartId >= 0 && chartId != lastId)
   {
      if(chartId != excludeChartId && ChartSymbol(chartId) == symbol && (ENUM_TIMEFRAMES)ChartPeriod(chartId) == timeframe)
         return chartId;
      lastId = chartId;
      chartId = ChartNext(chartId);
   }
   return -1;
}

bool Controller_ChartMatches(long chartId, string symbol, ENUM_TIMEFRAMES timeframe)
{
   if(chartId <= 0) return false;
   return ChartSymbol(chartId) == symbol && (ENUM_TIMEFRAMES)ChartPeriod(chartId) == timeframe;
}

long Controller_WaitForChart(string symbol, ENUM_TIMEFRAMES timeframe, int timeoutSeconds, long excludeChartId = 0)
{
   datetime started = TimeCurrent();
   while(TimeCurrent() - started <= timeoutSeconds)
   {
      long chartId = Controller_FindChart(symbol, timeframe, excludeChartId);
      if(chartId > 0) return chartId;
      Sleep(1000);
   }
   return -1;
}

string Controller_ChartJson(long chartId)
{
   if(chartId <= 0) return "{\"chartId\":\"\",\"symbol\":\"\",\"timeframe\":\"\"}";
   string chartSymbol = ChartSymbol(chartId);
   string chartTimeframe = ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)ChartPeriod(chartId));
   return "{\"chartId\":\"" + IntegerToString((int)chartId) + "\",\"symbol\":\"" + ReplayFX_EscapeJson(chartSymbol) + "\",\"timeframe\":\"" + ReplayFX_EscapeJson(chartTimeframe) + "\"}";
}

string Controller_TargetResultJson(string requestedSymbol, string resolvedSymbol, string requestedTimeframe, long chartId, string templateName, string message, string suggestionsJson = "", bool selectedResult = false, int chartOpenError = 0)
{
   string actualSymbol = "";
   string actualTimeframe = "";
   if(chartId > 0)
   {
      actualSymbol = ChartSymbol(chartId);
      actualTimeframe = ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)ChartPeriod(chartId));
   }
   string out = "{\"requestedSymbol\":\"" + ReplayFX_EscapeJson(requestedSymbol) + "\",";
   out += "\"resolvedSymbol\":\"" + ReplayFX_EscapeJson(resolvedSymbol) + "\",";
   out += "\"selectedResult\":" + (selectedResult ? "true" : "false") + ",";
   out += "\"chartOpenError\":" + IntegerToString(chartOpenError) + ",";
   out += "\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(requestedTimeframe) + "\",";
   out += "\"actualSymbol\":\"" + ReplayFX_EscapeJson(actualSymbol) + "\",";
   out += "\"actualTimeframe\":\"" + ReplayFX_EscapeJson(actualTimeframe) + "\",";
   out += "\"chartId\":\"" + IntegerToString((int)chartId) + "\",";
   out += "\"templateName\":\"" + ReplayFX_EscapeJson(templateName) + "\",";
   out += "\"message\":\"" + ReplayFX_EscapeJson(message) + "\",";
   if(suggestionsJson != "") out += "\"suggestions\":" + suggestionsJson + ",";
   out += "\"nextExpected\":\"WAITING_EA_HEARTBEAT\"}";
   return out;
}

bool Controller_RunCommand(
   string id,
   string commandType,
   string symbol,
   string timeframeText,
   string templateName,
   string fileName,
   string chartIdText,
   int width,
   int height,
   bool autoOpenChart,
   bool fallbackToControllerChart
)
{
   commandType = Controller_NormalizeValue(commandType);
   StringToUpper(commandType);
   Print("ReplayFX RunCommand ENTER id=", id, " type=[", commandType, "] len=", StringLen(commandType));

   if(commandType == "SELF_TEST_RESULT")
   {
      Print("ReplayFX Controller SELF_TEST_RESULT id=", id);
      bool ok = Controller_Report(id, "SUCCESS", "{\"message\":\"controller result reporting works\"}");
      Print("ReplayFX Controller SELF_TEST_RESULT report ok=", ok);
      return ok;
   }

   if(!Controller_IsSafeCommand(commandType))
      return Controller_Report(id, "REJECTED", "{\"error\":\"Unsupported or unsafe controller command\",\"parsedCommandType\":\"" + ReplayFX_EscapeJson(commandType) + "\"}");

   if(commandType == "UPDATE_CONFIG" || commandType == "SET_MODE" || commandType == "PAUSE_EA" || commandType == "RESUME_EA")
      return Controller_Report(id, "SUCCESS", "{\"message\":\"Command recorded by backend. Integrated EAs load runtime config through ReplayFX_LoadConfig().\"}");

   if(commandType == "LIST_SYMBOLS")
   {
      Print("ReplayFX Controller LIST_SYMBOLS id=", id);
      return Controller_Report(id, "SUCCESS", Controller_SymbolsJson());
   }

   if(commandType == "LIST_CHARTS")
   {
      Print("ReplayFX Controller LIST_CHARTS id=", id);
      return Controller_Report(id, "SUCCESS", Controller_ChartsJson());
   }

   if(commandType == "OPEN_CHART")
   {
      if(symbol == "") { Print("ReplayFX Controller OPEN_CHART failed id=", id, " symbol is required"); return Controller_Report(id, "FAILED", "{\"error\":\"symbol is required\"}"); }
      ENUM_TIMEFRAMES tf = Controller_TimeframeFromString(timeframeText);
      string resolvedSymbol = Controller_ResolveBrokerSymbol(symbol);
      if(resolvedSymbol == "")
         return Controller_Report(id, "FAILED", "{\"requestedSymbol\":\"" + ReplayFX_EscapeJson(symbol) + "\",\"resolvedSymbol\":\"\",\"selectedResult\":false,\"chartOpenError\":0,\"actualSymbol\":\"\",\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(timeframeText) + "\",\"actualTimeframe\":\"\",\"chartId\":\"-1\",\"message\":\"Symbol not found\",\"suggestions\":" + Controller_SymbolSuggestionsJson(symbol) + "}");
      bool selectedResult = Controller_SelectSymbolForChart(resolvedSymbol);
      Print("ReplayFX Controller OPEN_CHART start id=", id, " requestedSymbol=", symbol, " resolvedSymbol=", resolvedSymbol, " timeframe=", timeframeText);
      ResetLastError();
      long opened = ChartOpen(resolvedSymbol, tf);
      int openError = GetLastError();
      if(opened <= 0 && openError == 4302)
      {
         selectedResult = Controller_SelectSymbolForChart(resolvedSymbol);
         ResetLastError();
         opened = ChartOpen(resolvedSymbol, tf);
         openError = GetLastError();
      }
      Print("ReplayFX Controller OPEN_CHART result id=", id, " chartId=", IntegerToString((int)opened), " error=", IntegerToString(openError));
      if(opened <= 0)
         return Controller_Report(id, "FAILED", "{\"error\":\"ChartOpen failed\",\"requestedSymbol\":\"" + ReplayFX_EscapeJson(symbol) + "\",\"resolvedSymbol\":\"" + ReplayFX_EscapeJson(resolvedSymbol) + "\",\"selectedResult\":" + (selectedResult ? "true" : "false") + ",\"chartOpenError\":" + IntegerToString(openError) + ",\"actualSymbol\":\"\",\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(timeframeText) + "\",\"actualTimeframe\":\"\",\"chartId\":\"-1\",\"mt5Error\":" + IntegerToString(openError) + ",\"message\":\"ChartOpen failed\"}");
      return Controller_Report(id, "SUCCESS", "{\"requestedSymbol\":\"" + ReplayFX_EscapeJson(symbol) + "\",\"resolvedSymbol\":\"" + ReplayFX_EscapeJson(resolvedSymbol) + "\",\"selectedResult\":" + (selectedResult ? "true" : "false") + ",\"chartOpenError\":" + IntegerToString(openError) + ",\"actualSymbol\":\"" + ReplayFX_EscapeJson(ChartSymbol(opened)) + "\",\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(timeframeText) + "\",\"actualTimeframe\":\"" + ReplayFX_EscapeJson(ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)ChartPeriod(opened))) + "\",\"chartId\":\"" + IntegerToString((int)opened) + "\",\"message\":\"Chart opened\"}");
   }

   if(commandType == "APPLY_TEMPLATE")
   {
      if(symbol == "") { Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " symbol is required"); return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, "", timeframeText, -1, templateName, "symbol is required")); }
      if(templateName == "") templateName = Controller_TemplateNameFromFileName(fileName);
      if(templateName == "") { Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " templateName is required"); return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, "", timeframeText, -1, templateName, "templateName is required")); }
      ENUM_TIMEFRAMES tf = Controller_TimeframeFromString(timeframeText);
      string resolvedSymbol = Controller_ResolveBrokerSymbol(symbol);
      if(resolvedSymbol == "")
      {
         Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " symbol not found requestedSymbol=", symbol);
         return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, "", timeframeText, -1, templateName, "Symbol not found", Controller_SymbolSuggestionsJson(symbol)));
      }
      bool selectedResult = Controller_SelectSymbolForChart(resolvedSymbol);
      int openError = 0;
      long controllerChartId = ChartID();
      Print("ReplayFX Controller APPLY_TEMPLATE start id=", id, " requestedSymbol=", symbol, " resolvedSymbol=", resolvedSymbol, " selectedResult=", (selectedResult ? "true" : "false"), " timeframe=", timeframeText, " template=", templateName, " controllerChartId=", IntegerToString((int)controllerChartId));
      long chartId = Controller_FindChart(resolvedSymbol, tf, controllerChartId);
      Print("ReplayFX Controller APPLY_TEMPLATE chart search result id=", id, " chartId=", IntegerToString((int)chartId));
      if(chartId <= 0)
      {
         Print("ReplayFX Controller APPLY_TEMPLATE chart open start id=", id, " requestedSymbol=", symbol, " resolvedSymbol=", resolvedSymbol, " timeframe=", timeframeText);
         ResetLastError();
         chartId = ChartOpen(resolvedSymbol, tf);
         openError = GetLastError();
         if(chartId <= 0 && openError == 4302)
         {
            selectedResult = Controller_SelectSymbolForChart(resolvedSymbol);
            ResetLastError();
            chartId = ChartOpen(resolvedSymbol, tf);
            openError = GetLastError();
         }
         Print("ReplayFX Controller APPLY_TEMPLATE chart open result id=", id, " chartId=", IntegerToString((int)chartId), " error=", IntegerToString(openError));
         if(chartId <= 0) { Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " ChartOpen failed"); return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, resolvedSymbol, timeframeText, -1, templateName, "ChartOpen failed", "", selectedResult, openError)); }
      }
      Print("ReplayFX Controller APPLY_TEMPLATE waiting exact chart id=", id, " requestedSymbol=", symbol, " resolvedSymbol=", resolvedSymbol, " timeframe=", timeframeText, " excludeControllerChart=", IntegerToString((int)controllerChartId));
      chartId = Controller_WaitForChart(resolvedSymbol, tf, 10, controllerChartId);
      if(chartId <= 0) { Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " Target chart not opened/found"); return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, resolvedSymbol, timeframeText, -1, templateName, "Target chart not opened/found: " + resolvedSymbol + " " + timeframeText, "", selectedResult, openError)); }
      if(chartId == controllerChartId) { Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " Target chart equals controller chart"); return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, resolvedSymbol, timeframeText, chartId, templateName, "Target chart equals controller chart", "", selectedResult, openError)); }
      ResetLastError();
      Print("ReplayFX Controller template apply start id=", id, " chartId=", IntegerToString((int)chartId), " symbol=", ChartSymbol(chartId), " timeframe=", ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)ChartPeriod(chartId)), " template=", templateName);
      bool applied = ChartApplyTemplate(chartId, templateName);
      Print("ReplayFX Controller template apply result id=", id, " applied=", (applied ? "true" : "false"), " error=", IntegerToString(GetLastError()));
      if(!applied) { Print("ReplayFX Controller APPLY_TEMPLATE failed id=", id, " Template not found"); return Controller_Report(id, "FAILED", Controller_TargetResultJson(symbol, resolvedSymbol, timeframeText, chartId, templateName, "Template not found. Create the template in MT5 first.", "", selectedResult, openError)); }
      ChartRedraw(chartId);
      Sleep(500);
      Print("ReplayFX Controller APPLY_TEMPLATE success id=", id, " chartId=", IntegerToString((int)chartId));
      return Controller_Report(id, "WAITING_EA_HEARTBEAT", Controller_TargetResultJson(symbol, resolvedSymbol, timeframeText, chartId, templateName, "Template applied. Waiting for EA heartbeat.", "", selectedResult, openError));
   }

   if(commandType == "SCREENSHOT_CHART")
   {
      ENUM_TIMEFRAMES tf = Controller_TimeframeFromString(timeframeText);
      long chartId = -1;
      if(chartIdText != "")
         chartId = (long)StringToInteger(chartIdText);
      else if(symbol != "" && timeframeText != "")
         chartId = Controller_FindChart(symbol, tf);
      else
         chartId = ChartID();

      if(chartId <= 0)
      {
         string target = symbol != "" ? symbol + " " + timeframeText : "current chart";
         Print("ReplayFX Controller SCREENSHOT_CHART failed id=", id, " target=", target, " chart not found");
         return Controller_Report(id, "FAILED", "{\"error\":\"Target chart not found: " + ReplayFX_EscapeJson(target) + "\",\"requestedSymbol\":\"" + ReplayFX_EscapeJson(symbol) + "\",\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(timeframeText) + "\"}");
      }

      string chartSymbol = ChartSymbol(chartId);
      string chartTimeframe = ReplayFX_TimeframeToString((ENUM_TIMEFRAMES)ChartPeriod(chartId));
      int shotWidth = width <= 0 ? 1280 : width;
      int shotHeight = height <= 0 ? 720 : height;
      string fileNameOut = "ReplayFX_Controller_" + chartSymbol + "_" + chartTimeframe + "_" + IntegerToString((int)TimeCurrent()) + ".png";
      Print("ReplayFX Controller SCREENSHOT_CHART start id=", id, " chartId=", IntegerToString((int)chartId), " symbol=", chartSymbol, " timeframe=", chartTimeframe, " width=", IntegerToString(shotWidth), " height=", IntegerToString(shotHeight), " file=", fileNameOut);
      bool ok = ReplayFX_TakeChartScreenshot(chartId, fileNameOut, shotWidth, shotHeight);
      Print("ReplayFX Controller SCREENSHOT_CHART result id=", id, " ok=", (ok ? "true" : "false"), " error=", IntegerToString(GetLastError()), " file=", fileNameOut);
      if(!ok) return Controller_Report(id, "FAILED", "{\"error\":\"ChartScreenShot failed\",\"mt5Error\":" + IntegerToString(GetLastError()) + ",\"requestedSymbol\":\"" + ReplayFX_EscapeJson(symbol) + "\",\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(timeframeText) + "\",\"chartId\":\"" + IntegerToString((int)chartId) + "\"}");
      string resultJson = "{\"requestedSymbol\":\"" + ReplayFX_EscapeJson(symbol) + "\",";
      resultJson += "\"requestedTimeframe\":\"" + ReplayFX_EscapeJson(timeframeText) + "\",";
      resultJson += "\"actualSymbol\":\"" + ReplayFX_EscapeJson(chartSymbol) + "\",";
      resultJson += "\"actualTimeframe\":\"" + ReplayFX_EscapeJson(chartTimeframe) + "\",";
      resultJson += "\"chartId\":\"" + IntegerToString((int)chartId) + "\",";
      resultJson += "\"filePath\":\"" + ReplayFX_EscapeJson(fileNameOut) + "\",";
      resultJson += "\"localFilePath\":\"" + ReplayFX_EscapeJson(fileNameOut) + "\",";
      resultJson += "\"fileName\":\"" + ReplayFX_EscapeJson(fileNameOut) + "\",";
      resultJson += "\"width\":" + IntegerToString(shotWidth) + ",";
      resultJson += "\"height\":" + IntegerToString(shotHeight) + ",";
      resultJson += "\"message\":\"Saved locally in MT5 MQL5/Files.\"}";
      return Controller_Report(id, "SUCCESS", resultJson);
   }

   Print("ReplayFX Controller unsupported command id=", id, " type=", commandType);
   return Controller_Report(id, "FAILED", "{\"error\":\"Unsupported command in controller\",\"parsedCommandType\":\"" + ReplayFX_EscapeJson(commandType) + "\"}");
}

bool Controller_Poll()
{
   string response;
   int httpStatus;
   string endpoint = "/api/ea-control/commands/poll?terminalId=" + ControllerTerminalId + "&format=flat";
   if(!ReplayFX_WebRequestGet(endpoint, response, httpStatus)) return false;
   ControllerLastPollAt = TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS);
   Print("ReplayFX Poll raw response=", response);

   string empty = Controller_NormalizeValue(Controller_ReadLineValue(response, "empty", "false"));
   string blocked = Controller_NormalizeValue(Controller_ReadLineValue(response, "blocked", "false"));

   Print("ReplayFX parsed flags empty=[", empty, "] blocked=[", blocked, "]");

   if(empty == "true" || empty == "1" || empty == "yes")
   {
      if(blocked == "true" || blocked == "1" || blocked == "yes")
      {
         Print("ReplayFX poll blocked. blockedBy=", Controller_ReadLineValue(response, "blockedBy", ""),
               " blockedStatus=", Controller_ReadLineValue(response, "blockedStatus", ""),
               " activeCommandType=", Controller_ReadLineValue(response, "activeCommandType", ""),
               " message=", Controller_ReadLineValue(response, "message", ""));
      }
      else
      {
         Print("ReplayFX poll empty. No command.");
      }
      return true;
   }

   string id = Controller_NormalizeValue(Controller_ReadLineValue(response, "id", ""));
   string commandType = Controller_NormalizeValue(Controller_ReadLineValue(response, "commandType", ""));
   string symbol = Controller_ReadLineValue(response, "symbol", "");
   string timeframeText = Controller_ReadLineValue(response, "timeframe", "M5");
   string templateName = Controller_ReadLineValue(response, "templateName", "");
   string fileName = Controller_ReadLineValue(response, "fileName", "");
   string chartIdText = Controller_ReadLineValue(response, "chartId", "");
   ControllerCurrentPickToken = Controller_NormalizeValue(Controller_ReadLineValue(response, "pickToken", ""));
   int width = (int)StringToInteger(Controller_ReadLineValue(response, "width", "1280"));
   int height = (int)StringToInteger(Controller_ReadLineValue(response, "height", "720"));
   string autoOpenChartText = Controller_NormalizeValue(Controller_ReadLineValue(response, "autoOpenChart", "false"));
   string fallbackToControllerChartText = Controller_NormalizeValue(Controller_ReadLineValue(response, "fallbackToControllerChart", "false"));
   bool autoOpenChart = autoOpenChartText == "true" || autoOpenChartText == "1" || autoOpenChartText == "yes";
   bool fallbackToControllerChart = fallbackToControllerChartText == "true" || fallbackToControllerChartText == "1" || fallbackToControllerChartText == "yes";

   StringTrimRight(id);
   StringTrimLeft(id);
   StringTrimRight(commandType);
   StringTrimLeft(commandType);

   Print("ReplayFX parsed command id=", id, " type=", commandType, " pickToken=", ControllerCurrentPickToken);

   if(id == "" || id == "0")
   {
      Print("ReplayFX invalid poll response: missing command id. raw=", response);
      return false;
   }

   if(commandType == "" || commandType == "0")
   {
      Print("ReplayFX invalid poll response: missing commandType. raw=", response);
      return false;
   }

   Print("ReplayFX about to run command args id=", id,
         " commandType=", commandType,
         " symbol=", symbol,
         " timeframe=", timeframeText,
         " autoOpenChart=", (autoOpenChart ? "true" : "false"),
         " fallbackToControllerChart=", (fallbackToControllerChart ? "true" : "false"));
   return Controller_RunCommand(
      id,
      commandType,
      symbol,
      timeframeText,
      templateName,
      fileName,
      chartIdText,
      width,
      height,
      autoOpenChart,
      fallbackToControllerChart
   );
}

int OnInit()
{
   ControllerTerminalId = InpReplayFXTerminalId;
   if(ControllerTerminalId == "")
      ControllerTerminalId = "ReplayFX-MT5-" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));

   if(InpReplayFXSecretToken == "")
      Print("ReplayFX MT5 Controller auth error: InpReplayFXSecretToken is empty. Set it to the backend secret token.");
   ReplayFX_Init(
      InpReplayFXBackendURL,
      InpReplayFXSecretToken,
      ControllerTerminalId,
      "controller",
      "ReplayFX MT5 Controller",
      REPLAYFX_AUTO,
      MathMax(2, InpHeartbeatSeconds),
      false,
      360,
      false
   );

   EventSetTimer((int)MathMax(2, InpHeartbeatSeconds));
   ReplayFX_SendHeartbeat("CONTROLLER_ONLINE");
   Controller_Poll();
   Print("ReplayFX MT5 Controller started. terminalId=", ControllerTerminalId, ". Safe commands enabled: LIST_SYMBOLS, LIST_CHARTS, OPEN_CHART, APPLY_TEMPLATE, SCREENSHOT_CHART, SELF_TEST_RESULT.");
   Print("ReplayFX MT5 Controller manual trading commands remain disabled: BUY, SELL, CLOSE_ALL, MODIFY_SL, MODIFY_TP.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ReplayFX_SendHeartbeat("CONTROLLER_STOPPED");
   EventKillTimer();
}

void OnTimer()
{
   ReplayFX_SendHeartbeat("CONTROLLER_ONLINE");
   Controller_Poll();
}
