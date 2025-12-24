import { useEffect, useMemo, useState } from 'react';
import HomePage from './pages/HomePage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import InsightsPage from './pages/InsightsPage';
import TrustCenterPage from './pages/TrustCenterPage';
import AuthPage from './pages/AuthPage';

const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/subscriptions', label: 'Subscriptions' },
  { path: '/trust-center', label: 'Trust Center' },
  { path: '/insights', label: 'Insights' },
  { path: '/auth', label: 'Auth' },
];

function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (target: string) => {
    if (target === path) return;
    window.history.pushState({}, '', target);
    setPath(target);
  };

  const content = useMemo(() => {
    switch (path) {
      case '/subscriptions':
        return <SubscriptionsPage />;
      case '/trust-center':
        return <TrustCenterPage />;
      case '/insights':
        return <InsightsPage />;
      case '/auth':
        return <AuthPage />;
      default:
        return <HomePage />;
    }
  }, [path]);

  return (
    <div className="app-shell">
      <nav>
        {navLinks.map((link) => (
          <a
            key={link.path}
            href={link.path}
            className={path === link.path ? 'active' : ''}
            onClick={(event) => {
              event.preventDefault();
              navigate(link.path);
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
      {content}
    </div>
  );
}

export default App;
