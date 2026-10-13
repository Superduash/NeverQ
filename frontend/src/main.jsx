import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import Landing from './pages/Landing.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing />
  </StrictMode>
);
