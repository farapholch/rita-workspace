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

  // Sections
  sectionDrawings: string;
  sectionWorkspace: string;

  // Actions with descriptions
  createNewDrawing: string;
  createNewDrawingDesc: string;
  openFromFile: string;
  openFromFileDesc: string;
  saveAllBackup: string;
  saveAllBackupDesc: string;
  loadBackup: string;
  loadBackupDesc: string;

  // Messages
  noDrawingsYet: string;
  clickNewToStart: string;
  modified: string;
  confirmDelete: string;

  // Export/Import (legacy)
  exportWorkspace: string;
  importWorkspace: string;
  exportDrawing: string;
  importDrawing: string;

  // Folders
  createFolder: string;
  renameFolder: string;
  deleteFolder: string;
  deleteFolderConfirm: string;
  moveToFolder: string;
  moveToRoot: string;
  newFolderName: string;

  // Backup reminder
  backupReminder: string;
  days: string;

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

  // Sections
  sectionDrawings: 'Ritningar (enskilda filer)',
  sectionWorkspace: 'Hela arbetsytan (alla ritningar)',

  // Actions with descriptions
  createNewDrawing: 'Skapa ny ritning',
  createNewDrawingDesc: 'Skapar en tom ritning i din arbetsyta',
  openFromFile: 'Importera ritning från fil',
  openFromFileDesc: 'Importerar en sparad ritning från din dator',
  saveAllBackup: 'Spara alla ritningar (backup)',
  saveAllBackupDesc: 'Ladda ner hela din arbetsyta som backup',
  loadBackup: 'Läs in sparad arbetsyta',
  loadBackupDesc: 'Återställ alla ritningar från en tidigare backup',

  // Messages
  noDrawingsYet: 'Inga ritningar ännu.',
  clickNewToStart: 'Klicka "Skapa ny ritning" för att börja.',
  modified: 'Ändrad',
  confirmDelete: 'Vill du ta bort denna ritning?',

  // Export/Import (legacy)
  exportWorkspace: 'Exportera arbetsyta',
  importWorkspace: 'Importera arbetsyta',
  exportDrawing: 'Spara som .excalidraw',
  importDrawing: 'Öppna .excalidraw',

  // Folders
  createFolder: 'Skapa mapp',
  renameFolder: 'Byt namn på mapp',
  deleteFolder: 'Ta bort mapp',
  deleteFolderConfirm: 'Vill du ta bort denna mapp? Ritningarna flyttas till rotnivån.',
  moveToFolder: 'Flytta till mapp',
  moveToRoot: 'Ingen mapp',
  newFolderName: 'Ny mapp',

  // Backup reminder
  backupReminder: 'Senaste backup:',
  days: 'dagar sedan',

  // Shortcuts
  shortcutNewDrawing: 'Ctrl+Alt+N',
};

const en: Translations = {
  // Menu
  drawings: 'Workspace',
  newDrawing: 'New drawing',
  manageDrawings: 'Manage workspace...',

  // Dialog
  dialogTitle: 'My Workspace',
  close: 'Close',
  open: 'Open',
  rename: 'Rename',
  delete: 'Delete',
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',

  // Sections
  sectionDrawings: 'Drawings (individual files)',
  sectionWorkspace: 'Entire workspace (all drawings)',

  // Actions with descriptions
  createNewDrawing: 'Create new drawing',
  createNewDrawingDesc: 'Creates an empty drawing in your workspace',
  openFromFile: 'Import drawing from file',
  openFromFileDesc: 'Imports a saved drawing from your computer',
  saveAllBackup: 'Save all drawings (backup)',
  saveAllBackupDesc: 'Download your entire workspace as a backup',
  loadBackup: 'Load saved workspace',
  loadBackupDesc: 'Restore all drawings from a previous backup',

  // Messages
  noDrawingsYet: 'No drawings yet.',
  clickNewToStart: 'Click "Create new drawing" to start.',
  modified: 'Modified',
  confirmDelete: 'Do you want to delete this drawing?',

  // Export/Import (legacy)
  exportWorkspace: 'Export workspace',
  importWorkspace: 'Import workspace',
  exportDrawing: 'Save as .excalidraw',
  importDrawing: 'Open .excalidraw',

  // Folders
  createFolder: 'Create folder',
  renameFolder: 'Rename folder',
  deleteFolder: 'Delete folder',
  deleteFolderConfirm: 'Delete this folder? Drawings will be moved to root.',
  moveToFolder: 'Move to folder',
  moveToRoot: 'No folder',
  newFolderName: 'New folder',

  // Backup reminder
  backupReminder: 'Last backup:',
  days: 'days ago',

  // Shortcuts
  shortcutNewDrawing: 'Ctrl+Alt+N',
};

const translations: Record<SupportedLanguage, Translations> = {
  sv,
  en,
};

export function getTranslations(langCode?: string): Translations {
  if (!langCode) return en;
  const lang = langCode.split('-')[0].toLowerCase();
  if (lang in translations) {
    return translations[lang as SupportedLanguage];
  }
  return en;
}

export function isLanguageSupported(langCode?: string): boolean {
  if (!langCode) return false;
  const lang = langCode.split('-')[0].toLowerCase();
  return lang in translations;
}

export default translations;
