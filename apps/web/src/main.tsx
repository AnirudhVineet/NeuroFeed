import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// crypto.randomUUID is gated to secure contexts. The Capacitor Android WebView
// loads the dev server over plain HTTP during development, so the API is
// undefined there. Polyfill using getRandomValues (available in any context).
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  (crypto as Crypto & { randomUUID: () => string }).randomUUID = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (
        Number(c) ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
      ).toString(16),
    ) as `${string}-${string}-${string}-${string}-${string}`;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
