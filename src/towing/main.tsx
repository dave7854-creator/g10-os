import { createRoot } from 'react-dom/client';
import { TowingScreen } from './TowingScreen';

function TowingRoot() {
  return <TowingScreen onBack={() => { window.location.href = '/'; }} />;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<TowingRoot />);
}
