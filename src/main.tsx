import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './auth/amplify'
import './index.css'
import { DrumMachinePage } from './pages/DrumMachinePage.tsx'
import { WelcomePage } from './pages/WelcomePage.tsx'
import { Nav } from './components/Nav/Nav.tsx'
import { DonationModal } from './components/DonationModal/DonationModal.tsx'
import { TunerPage } from './pages/TunerPage.tsx'
import { ChordsPage } from './pages/ChordsPage.tsx'
import { CircleOfFifthsPage } from './pages/CircleOfFifthsPage.tsx'
import { ScalesPage } from './pages/ScalesPage.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { FavoritesProvider } from './context/FavoritesContext.tsx'
import { LessonsProgressProvider } from './context/LessonsProgressContext.tsx'
import { NoteColorsProvider } from './context/NoteColorsContext.tsx'
import { LessonsPage } from './pages/LessonsPage.tsx'
import { ModulePage } from './pages/ModulePage.tsx'
import { LessonPage } from './pages/LessonPage.tsx'
import { BuildLessonPage } from './pages/BuildLessonPage.tsx'
import { ClickTrackPage } from './pages/ClickTrackPage.tsx'
import { FretMemorizerPage } from './pages/FretMemorizerPage.tsx'
import { TabEditorPage } from './pages/TabEditorPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Authenticator.Provider>
      <FavoritesProvider>
      <LessonsProgressProvider>
      <NoteColorsProvider>
      <TooltipProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/drums" element={<DrumMachinePage />} />
          <Route path="/tuner" element={<TunerPage />} />
          <Route path="/chords" element={<ChordsPage />} />
          <Route path="/scales" element={<ScalesPage />} />
          <Route path="/circle" element={<CircleOfFifthsPage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/lessons/:moduleId" element={<ModulePage />} />
          <Route path="/lessons/:moduleId/:lessonId" element={<LessonPage />} />
          <Route path="/build-lesson" element={<BuildLessonPage />} />
          <Route path="/click-track" element={<ClickTrackPage />} />
          <Route path="/fret-memorizer" element={<FretMemorizerPage />} />
          <Route path="/tab-editor" element={<TabEditorPage />} />
        </Routes>
        <footer style={{ textAlign: 'center', padding: '1rem', color: '#666', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <span>&copy; Yuriy Tolstykh</span>
          <DonationModal />
        </footer>
      </BrowserRouter>
      </TooltipProvider>
      </NoteColorsProvider>
      </LessonsProgressProvider>
      </FavoritesProvider>
    </Authenticator.Provider>
  </StrictMode>,
)
