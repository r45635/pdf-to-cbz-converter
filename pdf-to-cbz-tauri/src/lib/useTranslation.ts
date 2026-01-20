import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { Language, translations, TranslationKey } from './translations';

const STORAGE_KEY = 'pdf-cbz-converter-lang';

// Helper to get language from localStorage
function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
  if (saved && translations[saved]) {
    return saved;
  }
  // Try to detect browser language
  const browserLang = navigator.language.split('-')[0];
  if (browserLang === 'fr') return 'fr';
  if (browserLang === 'es') return 'es';
  if (browserLang === 'zh') return 'zh';
  return 'en';
}

// Subscribers for language changes
let listeners: (() => void)[] = [];

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function notifyListeners() {
  listeners.forEach(l => l());
}

function getSnapshot(): Language {
  return getStoredLanguage();
}

function getServerSnapshot(): Language {
  return 'en';
}

export function useTranslation() {
  // Use useSyncExternalStore to sync language across components
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLang = useCallback((newLang: Language) => {
    localStorage.setItem(STORAGE_KEY, newLang);
    notifyListeners();
  }, []);

  // Listen for storage events from other tabs/windows
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        notifyListeners();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[lang][key] || translations.en[key] || key;
  }, [lang]);

  return { lang, setLang, t };
}
