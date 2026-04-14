import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { WorkspaceProvider, useWorkspace } from './state';
import { Sidebar } from './ui';

interface WorkspacePluginProps {
  children: ReactNode;
  defaultSidebarOpen?: boolean;
  sidebarWidth?: number;
}

function WorkspacePluginInner({
  children,
  defaultSidebarOpen = true,
  sidebarWidth = 250,
}: WorkspacePluginProps) {
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  const { activeDrawing } = useWorkspace();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+B: Toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }

      // Ctrl+Shift+N: New drawing
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        // Will be handled by Sidebar
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
      }}
    >
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={handleToggleSidebar}
        width={sidebarWidth}
      />
      <main
        style={{
          flex: 1,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * WorkspacePlugin - Wraps Excalidraw to add multi-drawing workspace support
 *
 * @example
 * ```tsx
 * import { WorkspacePlugin } from '@rita/workspace';
 *
 * function App() {
 *   return (
 *     <WorkspacePlugin>
 *       <Excalidraw />
 *     </WorkspacePlugin>
 *   );
 * }
 * ```
 */
export function WorkspacePlugin(props: WorkspacePluginProps) {
  return (
    <WorkspaceProvider>
      <WorkspacePluginInner {...props} />
    </WorkspaceProvider>
  );
}
