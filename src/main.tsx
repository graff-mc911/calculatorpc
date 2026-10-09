import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import {
  forceRefreshIfBuildChanged,
  registerServiceWorker,
} from './registerServiceWorker';

void (async () => {
  const refreshing = await forceRefreshIfBuildChanged();
  if (refreshing) return;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  registerServiceWorker();
})();
