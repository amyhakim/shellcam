import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './App.css'
import 'leaflet/dist/leaflet.css'
import './map.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
