//+------------------------------------------------------------------+
//|                                   ReplayFX_Journal_Connector.mq5 |
//|                               Copyright 2026, ReplayFX Journal   |
//|                                                                  |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, ReplayFX Journal"
#property link      ""
#property version   "1.00"

//--- Input parameters
input string   BackendURL = "http://127.0.0.1:5000"; // Backend API URL (do not add /api/...)
input string   SecretToken = "replayfx_secret_token_123";      // Webhook Secret Token
input string   AccountIdOverride = "";                      // Optional: Override Account ID (leaves blank to use AccountNumber)
input bool     SyncHistoryOnStart = false;                  // Sync recent history on EA start
input int      HistoryLookbackDays = 7;                     // Days to look back for history sync
input bool     SendAccountSnapshot = true;                  // Periodically send account snapshot
input int      SnapshotIntervalSeconds = 300;               // Interval in seconds to send snapshot (default 5 min)

//--- Global variables
string g_tradeUrl;
string g_snapshotUrl;
datetime g_lastSnapshotTime = 0;

//+------------------------------------------------------------------+
//| Helper: Escape JSON string
//+------------------------------------------------------------------+
string EscapeJSON(string inputStr) {
    string output = inputStr;
    StringReplace(output, "\\", "\\\\");
    StringReplace(output, "\"", "\\\"");
    StringReplace(output, "\n", "\\n");
    StringReplace(output, "\r", "\\r");
    return output;
}

//+------------------------------------------------------------------+
//| Helper: Send POST Request
//+------------------------------------------------------------------+
bool SendWebhook(string url, string payload) {
    Print("ReplayFX JSON payload: ", payload);

    uchar postData[];
    int len = StringLen(payload);
    ArrayResize(postData, len);
    StringToCharArray(payload, postData, 0, len, CP_UTF8);
    
    uchar result[];
    string resultHeaders = "";
    
    string headers = "Content-Type: application/json\r\n";
    headers += "Authorization: Bearer " + SecretToken + "\r\n";
    
    ResetLastError();
    int res = WebRequest("POST", url, headers, 10000, postData, result, resultHeaders);
    
    if(res == -1) {
        Print("WebRequest failed. Error code: ", GetLastError(), ". Make sure URL is added to WebRequest allowed list in Tools -> Options -> Expert Advisors");
        Print("URL: ", url, " | Payload Len: ", len);
        return false;
    } else if(res >= 200 && res < 300) {
        string resText = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
        Print("Webhook Success HTTP ", res, " | URL: ", url, " | Payload Len: ", len);
        return true;
    } else {
        string resText = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
        Print("Webhook returned HTTP ", res, " | URL: ", url, " | Payload Len: ", len);
        Print("Response body: ", resText);
        return false;
    }
}

//+------------------------------------------------------------------+
//| Send Trade Event
//+------------------------------------------------------------------+
void SendTradeEvent(ulong dealId, ulong positionId, string eventType, string symbol, string side, double lot, double price, datetime time, double sl, double tp, double commission, double swap, double profit, string comment, ulong magic) {
    string accNum = AccountIdOverride != "" ? AccountIdOverride : IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
    string broker = AccountInfoString(ACCOUNT_COMPANY);
    string brokerServer = AccountInfoString(ACCOUNT_SERVER);

    string json = "{";
    json += "\"accountNumber\":\"" + EscapeJSON(accNum) + "\",";
    json += "\"broker\":\"" + EscapeJSON(broker) + "\",";
    json += "\"brokerServer\":\"" + EscapeJSON(brokerServer) + "\",";
    json += "\"symbol\":\"" + EscapeJSON(symbol) + "\",";
    json += "\"dealId\":\"" + IntegerToString(dealId) + "\",";
    json += "\"positionId\":\"" + IntegerToString(positionId) + "\",";
    json += "\"eventType\":\"" + eventType + "\",";
    json += "\"side\":\"" + side + "\",";
    json += "\"lot\":" + DoubleToString(lot, 2) + ",";
    json += "\"price\":" + DoubleToString(price, 5) + ",";
    json += "\"sl\":" + DoubleToString(sl, 5) + ",";
    json += "\"tp\":" + DoubleToString(tp, 5) + ",";
    json += "\"commission\":" + DoubleToString(commission, 2) + ",";
    json += "\"swap\":" + DoubleToString(swap, 2) + ",";
    json += "\"profit\":" + DoubleToString(profit, 2) + ",";
    json += "\"comment\":\"" + EscapeJSON(comment) + "\",";
    json += "\"magicNumber\":\"" + IntegerToString(magic) + "\",";
    json += "\"time\":" + IntegerToString((int)time) + ",";
    json += "\"terminalLocalTime\":" + IntegerToString((int)TimeLocal()) + ",";
    json += "\"tradeServerTime\":" + IntegerToString((int)TimeTradeServer());
    json += "}";
    
    if(SendWebhook(g_tradeUrl, json)) {
        Print("Successfully sent trade event: Deal ", dealId, " (", eventType, ")");
    }
}

//+------------------------------------------------------------------+
//| Send Account Snapshot
//+------------------------------------------------------------------+
void SendAccountSnapshotEvent() {
    string accNum = AccountIdOverride != "" ? AccountIdOverride : IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
    string broker = AccountInfoString(ACCOUNT_COMPANY);
    
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
    
    string json = "{";
    json += "\"accountNumber\":\"" + EscapeJSON(accNum) + "\",";
    json += "\"broker\":\"" + EscapeJSON(broker) + "\",";
    json += "\"balance\":" + DoubleToString(balance, 2) + ",";
    json += "\"equity\":" + DoubleToString(equity, 2) + ",";
    json += "\"freeMargin\":" + DoubleToString(freeMargin, 2);
    json += "}";
    
    if(SendWebhook(g_snapshotUrl, json)) {
        Print("Successfully sent account snapshot.");
    }
}

//+------------------------------------------------------------------+
//| Process Deal (for OnTradeTransaction and HistorySync)
//+------------------------------------------------------------------+
void ProcessDeal(ulong dealTicket) {
    if(HistoryDealSelect(dealTicket)) {
        long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
        long entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
        
        // Only process BUY or SELL deals
        if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) return;
        
        string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
        ulong positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
        double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
        double price = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
        datetime time = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
        double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
        double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
        double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
        string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
        ulong magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
        
        string side = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
        
        double sl = 0, tp = 0;
        
        // Find current position SL/TP if position is open
        if(PositionSelectByTicket(positionId)) {
            sl = PositionGetDouble(POSITION_SL);
            tp = PositionGetDouble(POSITION_TP);
        } else {
             // Try to get from deal history if position is closed
             // In MT5, deal itself doesn't have SL/TP directly, we have to look up the related order
             ulong orderTicket = HistoryDealGetInteger(dealTicket, DEAL_ORDER);
             if(HistoryOrderSelect(orderTicket)) {
                 sl = HistoryOrderGetDouble(orderTicket, ORDER_SL);
                 tp = HistoryOrderGetDouble(orderTicket, ORDER_TP);
             }
        }
        
        string eventType = "";
        
        if(entryType == DEAL_ENTRY_IN) {
            eventType = "OPEN";
        } else if(entryType == DEAL_ENTRY_OUT || entryType == DEAL_ENTRY_INOUT) {
            // Check if it's partial or full close
            if(PositionSelectByTicket(positionId)) {
                // Position still exists -> partial close
                eventType = "PARTIAL_CLOSE";
            } else {
                // Position does not exist -> full close
                eventType = "CLOSE";
            }
            
            // For closing deals, the side is opposite to the original position.
            // We want to send the original side for clarity or let backend handle.
            // Sending the closing deal side.
        } else if(entryType == DEAL_ENTRY_OUT_BY) {
             eventType = "CLOSE";
        }
        
        if(eventType != "") {
            SendTradeEvent(dealTicket, positionId, eventType, symbol, side, volume, price, time, sl, tp, commission, swap, profit, comment, magic);
        }
    }
}

//+------------------------------------------------------------------+
//| Expert initialization function
//+------------------------------------------------------------------+
int OnInit()
  {
   Print("Initializing ReplayFX Connector...");
   
   // Clean up URLs
   string baseUrl = BackendURL;
   if(StringSubstr(baseUrl, StringLen(baseUrl)-1) == "/") {
       baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl)-1);
   }
   
   g_tradeUrl = baseUrl + "/api/integrations/mt5/trade-event";
   g_snapshotUrl = baseUrl + "/api/integrations/mt5/account-snapshot";
   
   EventSetTimer(5); // 5 second timer for history check and snapshot
   
   if(SendAccountSnapshot) {
       SendAccountSnapshotEvent();
       g_lastSnapshotTime = TimeCurrent();
   }
   
   if(SyncHistoryOnStart) {
       Print("Syncing history for the last ", HistoryLookbackDays, " days...");
       datetime end = TimeCurrent();
       datetime start = end - (HistoryLookbackDays * 86400);
       
       if(HistorySelect(start, end)) {
           int total = HistoryDealsTotal();
           Print("Found ", total, " deals in history.");
           for(int i=0; i<total; i++) {
               ulong ticket = HistoryDealGetTicket(i);
               if(ticket > 0) {
                   ProcessDeal(ticket);
               }
           }
       }
   }
   
   Print("Initialization complete.");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Print("ReplayFX Connector Deinitialized.");
  }

//+------------------------------------------------------------------+
//| Expert tick function (Not used primarily)
//+------------------------------------------------------------------+
void OnTick()
  {
  }

//+------------------------------------------------------------------+
//| TradeTransaction function
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
  {
   // Handle Deal additions
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
     {
      ProcessDeal(trans.deal);
     }
  }

//+------------------------------------------------------------------+
//| Timer function for fallback and snapshots
//+------------------------------------------------------------------+
void OnTimer()
  {
   datetime now = TimeCurrent();
   
   if(SendAccountSnapshot && (now - g_lastSnapshotTime) >= SnapshotIntervalSeconds) {
       SendAccountSnapshotEvent();
       g_lastSnapshotTime = now;
   }
   
   // A simple fallback could be implemented here to poll history if OnTradeTransaction missed something,
   // but since we send on startup and OnTradeTransaction is reliable in most VPS environments,
   // we keep this lightweight. The backend ignores duplicate dealIds.
  }
//+------------------------------------------------------------------+
