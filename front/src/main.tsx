import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/bluba.css';
// Después de bluba.css: sus tokens y el puente --bl-* deben ganar.
import './styles/neurodash.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
