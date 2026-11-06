import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { TeamPage } from '../pages/TeamPage';

createRoot(document.getElementById('app')!).render(<StrictMode><TeamPage /></StrictMode>);
