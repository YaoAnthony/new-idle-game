import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

export type UiLanguageSetting = 'system' | 'zh' | 'en';
export type SupportedLanguage = 'zh' | 'en';

export function getSystemLanguage(): SupportedLanguage {
  const language = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
  return language.startsWith('zh') ? 'zh' : 'en';
}

export function resolveLanguage(setting: UiLanguageSetting | undefined): SupportedLanguage {
  if (setting === 'zh' || setting === 'en') return setting;
  return getSystemLanguage();
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSystemLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['zh', 'en'],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

export default i18n;
