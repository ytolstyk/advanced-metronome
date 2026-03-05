import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Nav } from './components/Nav/Nav.tsx'
import { TunerPage } from './pages/TunerPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/tuner" element={<TunerPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
