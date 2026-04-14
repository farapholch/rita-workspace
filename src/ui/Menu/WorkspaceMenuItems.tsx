/**
 * Workspace Menu Items
 *
 * These components can be inserted into Excalidraw's main menu
 * to provide workspace/multi-drawing functionality.
 */

import React from 'react';
import { useWorkspace } from '../../state/WorkspaceContext';
import { getTranslations } from '../../i18n';
import type { Drawing } from '../../storage/db';

// Icons as SVG strings (similar to Excalidraw's icon style)
const DrawingsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export interface WorkspaceMenuItemsProps {
  /**
   * Language code (e.g., 'sv', 'en', 'sv-SE')
   * Falls back to English if not supported
   */
  lang?: string;

  /**
   * Called when a drawing is selected from the submenu
   */
  onDrawingSelect?: (drawing: Drawing) => void;

  /**
   * Called when "Manage Drawings" is clicked
   */
  onManageDrawings?: () => void;

  /**
   * Render function for menu item - allows integration with Excalidraw's DropdownMenuItem
   */
  renderMenuItem?: (props: {
    icon: React.ReactNode;
    children: React.ReactNode;
    onSelect: () => void;
    shortcut?: string;
  }) => React.ReactNode;

  /**
   * Render function for submenu - allows integration with Excalidraw's DropdownMenuSub
   */
  renderSubMenu?: (props: {
    trigger: React.ReactNode;
    children: React.ReactNode;
  }) => React.ReactNode;

  /**
   * Render function for separator
   */
  renderSeparator?: () => React.ReactNode;
}

/**
 * Default menu item renderer (fallback if not provided)
 */
const DefaultMenuItem: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
}> = ({ icon, children, onSelect, shortcut }) => (
  <button
    onClick={onSelect}
    className="rita-workspace-menu-item"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      padding: '8px 12px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      textAlign: 'left',
      fontSize: '14px',
    }}
  >
    <span style={{ width: '20px', height: '20px' }}>{icon}</span>
    <span style={{ flex: 1 }}>{children}</span>
    {shortcut && <span style={{ opacity: 0.5, fontSize: '12px' }}>{shortcut}</span>}
  </button>
);

/**
 * WorkspaceMenuItems - provides menu items for workspace functionality
 *
 * Usage with Excalidraw's menu system:
 * ```tsx
 * <MainMenu>
 *   <MainMenu.DefaultItems.LoadScene />
 *   <MainMenu.DefaultItems.SaveToActiveFile />
 *   <MainMenu.Separator />
 *   <WorkspaceMenuItems
 *     lang="sv"
 *     renderMenuItem={(props) => <MainMenu.Item {...props} />}
 *     renderSubMenu={(props) => <MainMenu.Sub>{props.children}</MainMenu.Sub>}
 *     renderSeparator={() => <MainMenu.Separator />}
 *   />
 * </MainMenu>
 * ```
 */
export const WorkspaceMenuItems: React.FC<WorkspaceMenuItemsProps> = ({
  lang,
  onDrawingSelect,
  onManageDrawings,
  renderMenuItem,
  renderSubMenu,
  renderSeparator,
}) => {
  const { drawings, activeDrawing, switchDrawing, createNewDrawing, t: contextT, lang: contextLang } = useWorkspace();
  // Use explicit lang prop if provided, otherwise use context language
  const t = lang ? getTranslations(lang) : contextT;

  const MenuItem = renderMenuItem || ((props) => <DefaultMenuItem {...props} />);
  const Separator = renderSeparator || (() => <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #ccc' }} />);

  const handleDrawingSelect = async (drawing: Drawing) => {
    await switchDrawing(drawing.id);
    onDrawingSelect?.(drawing);
  };

  const handleNewDrawing = async () => {
    await createNewDrawing();
  };

  // If renderSubMenu is provided, create a submenu with all drawings
  if (renderSubMenu) {
    return (
      <>
        {renderSubMenu({
          trigger: (
            <>
              {DrawingsIcon}
              <span>{t.drawings} ({drawings.length})</span>
            </>
          ),
          children: (
            <>
              {drawings.map((drawing) => (
                <React.Fragment key={drawing.id}>
                  {MenuItem({
                    icon: activeDrawing?.id === drawing.id ? '✓' : ' ',
                    children: drawing.name,
                    onSelect: () => handleDrawingSelect(drawing),
                  })}
                </React.Fragment>
              ))}
              {drawings.length > 0 && Separator()}
              {MenuItem({
                icon: PlusIcon,
                children: t.newDrawing,
                onSelect: handleNewDrawing,
                shortcut: t.shortcutNewDrawing,
              })}
              {onManageDrawings && MenuItem({
                icon: DrawingsIcon,
                children: t.manageDrawings,
                onSelect: onManageDrawings,
              })}
            </>
          ),
        })}
      </>
    );
  }

  // Otherwise, render flat list of recent drawings + new drawing button
  return (
    <>
      {MenuItem({
        icon: PlusIcon,
        children: t.newDrawing,
        onSelect: handleNewDrawing,
        shortcut: t.shortcutNewDrawing,
      })}
      {drawings.slice(0, 5).map((drawing) => (
        <React.Fragment key={drawing.id}>
          {MenuItem({
            icon: activeDrawing?.id === drawing.id ? '✓' : DrawingsIcon,
            children: drawing.name,
            onSelect: () => handleDrawingSelect(drawing),
          })}
        </React.Fragment>
      ))}
      {onManageDrawings && drawings.length > 5 && (
        <>
          {Separator()}
          {MenuItem({
            icon: DrawingsIcon,
            children: `${t.drawings} (${drawings.length})...`,
            onSelect: onManageDrawings,
          })}
        </>
      )}
    </>
  );
};

export default WorkspaceMenuItems;
