#!/usr/bin/env bash
set -e

PROJECT="$HOME/workspace/myfxjournal"
MT5="$HOME/wine-mt5/drive_c/Program Files/MetaTrader 5/MQL5"

mkdir -p "$MT5/Include"
mkdir -p "$MT5/Experts/Advisors"

cp "$PROJECT/server/integrations/mt5/ReplayFX_RemoteSDK.mqh" "$MT5/Include/ReplayFX_RemoteSDK.mqh"
cp "$PROJECT/server/integrations/mt5/ReplayFX_MT5_Controller.mq5" "$MT5/Experts/Advisors/ReplayFX_MT5_Controller.mq5"
cp "$PROJECT/server/integrations/mt5/ea-library/"*.mq5 "$MT5/Experts/Advisors/"

echo "Synced ReplayFX MQL5 files to Wine MT5."
