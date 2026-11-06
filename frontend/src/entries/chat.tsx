import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { ChatPage } from '../pages/ChatPage';

createRoot(document.getElementById('app')!).render(<StrictMode><ChatPage /></StrictMode>);
