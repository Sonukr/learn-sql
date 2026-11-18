import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ready } from './lib/sql';
import './styles.css';

const root = createRoot(document.getElementById('root'));
ready
  .then(() => root.render(<StrictMode><App /></StrictMode>))
  .catch((e) => root.render(<p className="fatal">Could not load the SQL engine: {e.message}</p>));
