'use client';

import { useState, useCallback, useEffect } from 'react';
import { Language, translations, TranslationKey } from './translations';

const STORAGE_KEY = 'pdf-cbz-converter-lang';

export function useTranslation() {
  const [lang, setLangState] = useState<Language>('en');

  // Load saved language on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && translations[saved]) {
      setLangState(saved);
    } else {
      // Try to detect browser language
      const browserLang = navigator.language.split('-')[0];
      if (browserLang === 'fr') setLangState('fr');
      else if (browserLang === 'es') setLangState('es');
      else if (browserLang === 'zh') setLangState('zh');
    }
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[lang][key] || translations.en[key] || key;
  }, [lang]);

  return { lang, setLang, t };
}
