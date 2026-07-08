# Remote Trade Execution Design (Future Implementation)

This document outlines the secure architectural flow for enabling remote trade execution via Telegram or WhatsApp. **By default, remote trade execution is disabled for safety.**

## Architectural Flow

1. **User Request**: A user sends a command like `/buy XAUUSD 0.1` via Telegram.
2. **Backend Validation**:
   - Webhook receives the command.
   - The backend strictly verifies that the `senderId` matches the whitelisted `TELEGRAM_ALLOWED_CHAT_IDS`.
   - The backend checks if `ALLOW_REMOTE_TRADE_EXECUTION=true` in environment variables. If false, it immediately rejects the command.
3. **Confirmation (2FA/OTP)**:
   - For high-risk actions, the backend replies with a confirmation button or requires a 4-digit PIN.
4. **Command Queueing**:
   - Once confirmed, the backend saves the command to the `CommandQueue` table with status `PENDING`.
5. **MT5 EA Polling / Socket**:
   - The MT5 EA polls a specific endpoint (e.g., `GET /api/integrations/mt5/commands/poll`) every 2-3 seconds.
   - The EA receives the `PENDING` command.
6. **EA Pre-Execution Validation**:
   - The EA checks local safety constraints (Max Lot, Max Daily Loss, Max Trades/Day).
   - If constraints fail, the EA reports `FAILED` back to the backend.
7. **Execution**:
   - The EA executes the trade using `OrderSend`.
8. **Feedback Loop**:
   - The EA sends an execution report back to `POST /api/integrations/mt5/commands/result`.
   - The backend updates the `CommandQueue` status to `EXECUTED`.
   - The backend sends a Telegram notification confirming the trade with the entry price and ticket number.

## Safety Requirements

If this feature is ever enabled, the following safety constraints **MUST** be implemented within the MT5 EA and the backend:

- **Disabled by Default**: Requires manual environment variable toggle (`ALLOW_REMOTE_TRADE_EXECUTION=true`).
- **Demo-Only Mode**: Initial rollout must enforce that the connected MT5 account is `DEMO`.
- **Account Whitelisting**: Remote execution only works on specific `accountNumber`s explicitly whitelisted in the database.
- **Max Lot Limit**: Hardcoded cap on the lot size (e.g., 0.5 lots maximum per command).
- **Max Daily Loss**: EA must reject commands if the account has already hit a predefined daily loss threshold.
- **Max Trades/Day**: Prevent spamming commands.
- **Command Expiry**: Commands older than 30 seconds are marked `EXPIRED` and ignored by the EA.
- **Emergency Stop / Kill Switch**: A `/stop_all` command that immediately closes all trades and disables further remote execution.
- **Audit Logging**: Every command, whether rejected or executed, is logged in `CommandLog` with the sender's ID.
- **Strict Authorization**: NEVER process commands from unknown sender IDs.
