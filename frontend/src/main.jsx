import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './styles/tailwind.css';
import './styles/motion.css';
import './styles/collections.css';
import './styles/navbar.css';
import './styles/home.css';
import './styles/theme.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
