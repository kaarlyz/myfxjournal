Fix ReplayFX Runtime Config architecture. Stop hardcoding EA parameters.



Current problem:

Runtime Config still shows wrong/stale parameters. It does not actually read the selected EA source. Example:

\- Momentum Candle has EMA filter parameters, but they do not appear.

\- After switching from Momentum to Martingale/Hedging, the menu still shows old/wrong parameters.

\- Parameters appear based on previously hardcoded prompt examples, not the real EA input list.

\- Applying config often does not change the EA GUI/behavior.



This is unacceptable. Runtime Config must be based on the selected EA source and selected active instance, not hardcoded fields.



Required architectural fix:



1\. Remove hardcoded strategy parameter lists.

Do not hardcode only:

lot, gridDistancePips, layers, maxFloatingLoss, targetProfit, maxTradesPerDay, etc.



Do not use any manually provided parameter list as the source of truth.



2\. Build real MQL5 input scanner.



Scan actual .mq5 source files in:

server/integrations/mt5/ea-library/

server/integrations/mt5/



For each EA file, extract all MQL5 input declarations:



Support:

\- input bool Name = true;

\- input int Name = 14;

\- input double Name = 1.5;

\- input string Name = "text";

\- input ENUM\_TIMEFRAMES Name = PERIOD\_M5;

\- input enum/custom enum values if declared in same file

\- input group "Group Name";

\- comments after declaration

\- display labels if variable names contain description text



Return schema:

{

&#x20; sourceFile,

&#x20; eaName,

&#x20; parameterKey,

&#x20; type,

&#x20; defaultValue,

&#x20; group,

&#x20; label,

&#x20; comment,

&#x20; lineNumber,

&#x20; liveEditable: false by default

}



Important:

The scanner must detect real params like EMA filter if they exist in Momentum source:

InpUseEMAFilter

InpEMAPeriod

InpEMATimeframe

InpEMAMethod

or whatever exact names exist in the file.



Do not invent parameter names.



3\. Add scanner endpoint.



GET /api/ea-control/templates/:id/parameters

GET /api/ea-control/eas/:fileName/parameters



These endpoints must return detected parameters from the actual file.



4\. Bind schema by exact EA identity.



Schema cache key must be:

\- fileName

\- sourceFile hash / modified time

\- templateId if available



Never use one global schema.



When selected EA changes:

\- clear previous schema

\- clear selected parameter

\- clear pending edit state

\- reload schema for the new EA only

\- reload currentConfig for the new instance only



5\. Active instance binding.



Every runtime config edit must use exact instanceId first.



Do not update by symbol/timeframe only.



Use:

\- instanceId

\- terminalId

\- chartId

\- eaName

\- symbol

\- timeframe

\- fileName/templateName if available



6\. Separate detected params and live editable params.



Detected params:

\- come from .mq5 input scanner

\- can be shown in UI

\- are not guaranteed live editable



Live editable params:

\- appear in EA heartbeat currentConfig/configSchema

\- can be changed through UPDATE\_CONFIG

\- must be applied by EA runtime variables



UI must display both clearly:



Example:

EMA Filter

InpUseEMAFilter: true

Source: detected from Momentumcandle\_ReplayFX.mq5

Live editable: yes/no



If liveEditable=false:

Show:

"Detected from source, but this EA does not apply it live yet."



7\. Do not fake live edit.



If user changes a detected-only parameter, do not pretend it changed EA.



Show:

"This parameter exists in the EA input list but is not runtime editable yet. Rebuild EA with ReplayFX runtime bridge to edit it live."



8\. Build Runtime Bridge Generator.



Add a tool/service that can generate runtime editable bridge for an EA:



Input:

\- source .mq5 file

\- detected input schema



Output:

\- runtime variables

\- OnInit default assignment

\- ApplyCustomConfig function

\- CurrentConfigJson function

\- ConfigSchemaJson function

\- replace safe usages of input variables with runtime variables



Example transformation:



input int InpEMAPeriod = 200;



becomes:



input int InpEMAPeriod = 200;

int RuntimeInpEMAPeriod;



OnInit:

RuntimeInpEMAPeriod = InpEMAPeriod;



Apply config:

if (ReplayFX\_ConfigHas("InpEMAPeriod"))

&#x20;  RuntimeInpEMAPeriod = ReplayFX\_ConfigInt("InpEMAPeriod", RuntimeInpEMAPeriod);



Current config:

"InpEMAPeriod": RuntimeInpEMAPeriod



Schema:

"InpEMAPeriod": { "type": "int", "default": 200, "liveEditable": true }



EA logic should use:

RuntimeInpEMAPeriod

not:

InpEMAPeriod



9\. Make this semi-automatic for new EA upload.



When user uploads/registers a new EA:

\- scan source inputs

\- show detected parameters

\- generate ReplayFX runtime bridge patch

\- compile patched EA

\- store template/EA metadata in database

\- show which parameters are live editable

\- do not require user to manually tell parameter names in prompt



10\. UI behavior.



Runtime Config menu must show selected EA clearly:



EA: Momentum Candle

File: Momentumcandle\_ReplayFX.mq5

Symbol: BTCUSD

TF: M5

Instance: 1f73b074

Chart: 123456789

Heartbeat: 5s ago



Sections:

A. Live Editable Parameters

B. Detected Source Inputs

C. Stored Config

D. Actual EA Config

E. Drift



11\. Parameter list must change when EA changes.



Test:

\- Select Momentum → should show Momentum source inputs, including EMA filter if present.

\- Select ERS → should show ERS source inputs.

\- Select Martingale/Hedging → should show Martingale/Hedging source inputs.

\- No schema leakage between EAs.



12\. Fix Telegram/WhatsApp session cache.



When user changes selected EA:

delete:

\- selectedParameter

\- pendingEdit

\- previousSchema

\- previousConfig

\- current page

\- cached parameter list



Then fetch schema/config for the selected instance only.



13\. Config application.



POST /api/ea-control/instances/:id/config must:

\- store config for exact instanceId

\- merge customConfig

\- increment configVersion

\- return config to EA through /api/ea-control/config

\- wait for heartbeat confirmation

\- compare actual currentConfig after update



If actual does not change:

show:

"Backend saved config, but EA did not apply it. This parameter may not be runtime editable yet."



14\. EA heartbeat.



Each EA must send:

\- currentConfig

\- configSchema

\- configVersion

\- eaName

\- fileName if possible

\- instanceId

\- chartId

\- symbol

\- timeframe



15\. No unsafe manual trading.

Keep blocked:

BUY

SELL

CLOSE\_ALL

MODIFY\_SL

MODIFY\_TP



Signal approval by signalId is allowed.

Manual arbitrary trade command is not allowed.



16\. Tests required.



Add or run tests for:

\- scanner detects all input params from Momentum source

\- scanner detects EMA filter params from Momentum if present

\- switching EA resets schema/session

\- config edit is bound to correct instanceId

\- detected-only param is not falsely shown as live editable

\- live editable param updates actual heartbeat currentConfig

\- server build passes

\- client build passes



Build:

npm run build --prefix server

npm run build --prefix client

