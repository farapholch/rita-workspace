/**
 * Rita Workspace Translations
 *
 * Supports Swedish (sv) and English (en)
 */

export type SupportedLanguage = 'sv' | 'en';

export interface Translations {
  // Menu
  drawings: string;
  newDrawing: string;
  manageDrawings: string;

  // Dialog
  dialogTitle: string;
  close: string;
  open: string;
  rename: string;
  delete: string;
  save: string;
  cancel: string;
  confirm: string;

  // Messages
  noDrawingsYet: string;
  clickNewToStart: string;
  modified: string;
  confirmDelete: string;

  // Export/Import
  exportWorkspace: string;
  importWorkspace: string;

  // Shortcuts
  shortcutNewDrawing: string;
}

const sv: Translations = {
  // Menu
  drawings: 'Arbetsyta',
  newDrawing: 'Ny ritning',
  manageDrawings: 'Hantera arbetsyta...',

  // Dialog
  dialogTitle: 'Min Arbetsyta',
  close: 'Stäng',
  open: 'Öppna',
  rename: 'Byt namn',
  delete: 'Ta bort',
  save: 'Spara',
  cancel: 'Avbryt',
  confirm: 'Bekräfta',

  // Messages
  noDrawingsYet: 'Inga ritningar ännu.',
  clickNewToStart: 'Klicka "Ny ritning" för att börja.',
  modified: 'Ändrad',
  confirmDelete: 'Vill du ta bort denna ritning?',

  // Export/Import
  exportWorkspace: 'Exportera',
  importWorkspace: 'Importera',

  // Shortcuts
  shortcutNewDrawing: 'Ctrl+Alt+N',
};

const en: Translations = {
  // Menu
  drawings: 'Workspace',
  newDrawing: 'New drawing',
  manageDrawings: 'Manage workspace...',

  // Dialog
  dialogTitle: 'Workspace',
  close: 'Close',
  open: 'Open',
  rename: 'Rename',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',

  // Messages
  noDrawingsYet: 'No drawings yet.',
  clickNewToStart: 'Click "New drawing" to start.',
  modified: 'Modified',
  confirmDelete: 'Do you want to delete this drawing?',

  // Export/Import
  exportWorkspace: 'Export',
  importWorkspace: 'Import',

  // Shortcuts
  shortcutNewDrawing: 'Ctrl+Alt+N',
};

const translations: Record<SupportedLanguage, Translations> = {
  sv,
  en,
};

/**
 * Get translations for a language code
 * Falls back to English if language is not supported
 */
export function getTranslations(langCode?: string): Translations {
  if (!langCode) return en;

  // Handle language codes like 'sv-SE', 'en-US', etc.
  const lang = langCode.split('-')[0].toLowerCase();

  if (lang in translations) {
    return translations[lang as SupportedLanguage];
  }

  return en; // Default to English
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(langCode?: string): boolean {
  if (!langCode) return false;
  const lang = langCode.split('-')[0].toLowerCase();
  return lang in translations;
}

export default translations;
