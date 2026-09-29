import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PayPortal } from './PayPortal';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PayPortal />
  </StrictMode>
);
