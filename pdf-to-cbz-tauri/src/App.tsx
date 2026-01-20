import { useState } from 'react';
import Home from './pages/page';
import Batch from './pages/batch';

type Page = 'home' | 'batch';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');

  return (
    <div className="min-h-screen">
      {currentPage === 'home' ? (
        <Home onNavigateToBatch={() => setCurrentPage('batch')} />
      ) : (
        <Batch onNavigateToHome={() => setCurrentPage('home')} />
      )}
    </div>
  );
}

export default App;
