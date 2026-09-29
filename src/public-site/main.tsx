import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicSite } from './PublicSite';
import '../public-site-styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicSite />
  </StrictMode>
);
