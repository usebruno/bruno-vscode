/**
 * Sidebar App
 *
 * Entry point for the VS Code sidebar mode.
 * Uses the same providers as the main app but renders VSSidebar instead of Bruno.
 */
import VSSidebar from '../components/Sidebar/VSSidebar';
import GlobalStyle from '../globalStyles';
import '../i18n';
import Main from './Main';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export default function SidebarApp() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <DndProvider backend={HTML5Backend}>
          <Main>
            <GlobalStyle />
            <VSSidebar />
          </Main>
        </DndProvider>
      </main>
    </div>
  );
}
