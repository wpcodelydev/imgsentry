import React from 'react';
import { WpAdminSimulator } from './components/WpAdminSimulator';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary componentName="ImgSentry" isTopLevel>
      <WpAdminSimulator />
    </ErrorBoundary>
  );
}

