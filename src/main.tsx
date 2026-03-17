import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './auth/amplify'
import './index.css'
import App from './App.tsx'
import { Nav } from './components/Nav/Nav.tsx'
import { DonationModal } from './components/DonationModal/DonationModal.tsx'
import { TunerPage } from './pages/TunerPage.tsx'
import { ChordsPage } from './pages/ChordsPage.tsx'
import { CircleOfFifthsPage } from './pages/CircleOfFifthsPage.tsx'
import { ScalesPage } from './pages/ScalesPage.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'
import { FavoritesProvider } from './context/FavoritesContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Authenticator.Provider>
      <FavoritesProvider>
      <TooltipProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/tuner" element={<TunerPage />} />
          <Route path="/chords" element={<ChordsPage />} />
          <Route path="/scales" element={<ScalesPage />} />
          <Route path="/circle" element={<CircleOfFifthsPage />} />
        </Routes>
        <footer style={{ textAlign: 'center', padding: '1rem', color: '#666', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <span>&copy; Yuriy Tolstykh</span>
          <DonationModal />
        </footer>
      </BrowserRouter>
      </TooltipProvider>
      </FavoritesProvider>
    </Authenticator.Provider>
  </StrictMode>,
)
