import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// ─── Indonesian (default) ───
import commonId from './locales/id/common.json';
import sidebarId from './locales/id/sidebar.json';
import homeId from './locales/id/home.json';
import dashboardId from './locales/id/dashboard.json';
import settingsId from './locales/id/settings.json';
import accountsId from './locales/id/accounts.json';
import createSessionId from './locales/id/createSession.json';
import csvImportId from './locales/id/csvImport.json';
import liveJournalId from './locales/id/liveJournal.json';
import eaControlId from './locales/id/eaControl.json';
import webhookId from './locales/id/webhook.json';
import integrationsId from './locales/id/integrations.json';
import monteCarloId from './locales/id/monteCarlo.json';
import propFirmId from './locales/id/propFirm.json';
import compareSessionsId from './locales/id/compareSessions.json';
import mt5Id from './locales/id/mt5.json';
import tradeModalId from './locales/id/tradeModal.json';
import quickLoggerId from './locales/id/quickLogger.json';

// ─── English ───
import commonEn from './locales/en/common.json';
import sidebarEn from './locales/en/sidebar.json';
import homeEn from './locales/en/home.json';
import dashboardEn from './locales/en/dashboard.json';
import settingsEn from './locales/en/settings.json';
import accountsEn from './locales/en/accounts.json';
import createSessionEn from './locales/en/createSession.json';
import csvImportEn from './locales/en/csvImport.json';
import liveJournalEn from './locales/en/liveJournal.json';
import eaControlEn from './locales/en/eaControl.json';
import webhookEn from './locales/en/webhook.json';
import integrationsEn from './locales/en/integrations.json';
import monteCarloEn from './locales/en/monteCarlo.json';
import propFirmEn from './locales/en/propFirm.json';
import compareSessionsEn from './locales/en/compareSessions.json';
import mt5En from './locales/en/mt5.json';
import tradeModalEn from './locales/en/tradeModal.json';
import quickLoggerEn from './locales/en/quickLogger.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      id: {
        common: commonId,
        sidebar: sidebarId,
        home: homeId,
        dashboard: dashboardId,
        settings: settingsId,
        accounts: accountsId,
        createSession: createSessionId,
        csvImport: csvImportId,
        liveJournal: liveJournalId,
        eaControl: eaControlId,
        webhook: webhookId,
        integrations: integrationsId,
        monteCarlo: monteCarloId,
        propFirm: propFirmId,
        compareSessions: compareSessionsId,
        mt5: mt5Id,
        tradeModal: tradeModalId,
        quickLogger: quickLoggerId,
      },
      en: {
        common: commonEn,
        sidebar: sidebarEn,
        home: homeEn,
        dashboard: dashboardEn,
        settings: settingsEn,
        accounts: accountsEn,
        createSession: createSessionEn,
        csvImport: csvImportEn,
        liveJournal: liveJournalEn,
        eaControl: eaControlEn,
        webhook: webhookEn,
        integrations: integrationsEn,
        monteCarlo: monteCarloEn,
        propFirm: propFirmEn,
        compareSessions: compareSessionsEn,
        mt5: mt5En,
        tradeModal: tradeModalEn,
        quickLogger: quickLoggerEn,
      },
    },
    defaultNS: 'common',
    fallbackLng: 'id',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'kafx_language',
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
