import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './auth/amplify'
// Must stay a static import right after './auth/amplify': it subscribes to Amplify's OAuth result at module load.
import { ReturnToPage } from './auth/ReturnToPage.tsx'
import { registerJoinCodeCleanup } from './bandJoinCode.ts'
import { registerServiceWorker } from './registerServiceWorker.ts'
import './index.css'
import { DrumMachinePage } from './pages/DrumMachinePage.tsx'
import { WelcomePage } from './pages/WelcomePage.tsx'
import { Nav } from './components/Nav/Nav.tsx'
import { DonationModal } from './components/DonationModal/DonationModal.tsx'
import { Button } from './components/ui/button.tsx'
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
import { TabLibraryPage } from './pages/TabLibraryPage.tsx'
import { PublishedTabViewPage } from './pages/PublishedTabViewPage.tsx'
import { MetronomePage } from './pages/MetronomePage.tsx'
import { EarTrainingPage } from './pages/EarTrainingPage.tsx'
import { ChordProgressionPage } from './pages/ChordProgressionPage.tsx'
import { CAGEDPage } from './pages/CAGEDPage.tsx'
import { PracticeSessionPage } from './pages/PracticeSessionPage.tsx'
import { IntervalTrainerPage } from './pages/IntervalTrainerPage.tsx'
import { ArpeggiosPage } from './pages/ArpeggiosPage.tsx'
import { BandsPage } from './pages/BandsPage.tsx'
import { BandPage } from './pages/BandPage.tsx'
import { SetListPage } from './pages/SetListPage.tsx'
import { AvailabilityPage } from './pages/AvailabilityPage.tsx'
import { SharedSetListPage } from './pages/SharedSetListPage.tsx'
import { ScrollToTop } from './components/ScrollToTop/ScrollToTop.tsx'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage.tsx'
import { TermsOfServicePage } from './pages/TermsOfServicePage.tsx'
import { Github } from 'lucide-react'

registerJoinCodeCleanup()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Authenticator.Provider>
      <FavoritesProvider>
      <LessonsProgressProvider>
      <NoteColorsProvider>
      <TooltipProvider>
      <BrowserRouter>
        <ReturnToPage />
        <ScrollToTop />
        <Nav />
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/drums" element={<DrumMachinePage />} />
          <Route path="/tuner" element={<TunerPage />} />
          <Route path="/chords" element={<ChordsPage />} />
          <Route path="/chord-progression" element={<ChordProgressionPage />} />
          <Route path="/scales" element={<ScalesPage />} />
          <Route path="/caged" element={<CAGEDPage />} />
          <Route path="/circle" element={<CircleOfFifthsPage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/lessons/:moduleId" element={<ModulePage />} />
          <Route path="/lessons/:moduleId/:lessonId" element={<LessonPage />} />
          <Route path="/build-lesson" element={<BuildLessonPage />} />
          <Route path="/click-track" element={<ClickTrackPage />} />
          <Route path="/fret-memorizer" element={<FretMemorizerPage />} />
          <Route path="/ear-training" element={<EarTrainingPage />} />
          <Route path="/tab-editor" element={<TabEditorPage />} />
          <Route path="/tabs" element={<TabLibraryPage />} />
          <Route path="/tabs/:id" element={<PublishedTabViewPage />} />
          <Route path="/metronome" element={<MetronomePage />} />
          <Route path="/practice" element={<PracticeSessionPage />} />
          <Route path="/interval-trainer" element={<IntervalTrainerPage />} />
          <Route path="/arpeggios" element={<ArpeggiosPage />} />
          <Route path="/bands" element={<BandsPage />} />
          <Route path="/bands/:bandId" element={<BandPage />} />
          <Route path="/bands/:bandId/availability" element={<AvailabilityPage />} />
          <Route path="/bands/:bandId/setlists/:setListId" element={<SetListPage />} />
          <Route path="/shared/:setListId" element={<SharedSetListPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
        </Routes>
        <footer style={{ textAlign: 'center', padding: '1rem', color: '#666', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span>&copy; Yuriy Tolstykh</span>
          <a href="https://github.com/ytolstyk/advanced-metronome" target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              <Github className="h-3.5 w-3.5" />
              GitHub
            </Button>
          </a>
          <DonationModal />
          <nav aria-label="Legal" style={{ display: 'flex', gap: '0.75rem' }}>
            <Link to="/privacy" className="underline">Privacy Policy</Link>
            <Link to="/terms" className="underline">Terms of Service</Link>
          </nav>
        </footer>
      </BrowserRouter>
      </TooltipProvider>
      </NoteColorsProvider>
      </LessonsProgressProvider>
      </FavoritesProvider>
    </Authenticator.Provider>
  </StrictMode>,
)
