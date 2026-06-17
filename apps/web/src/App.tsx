import { Route, Routes, Link, useLocation } from 'react-router-dom';
import FeedPage from './pages/FeedPage';
import UploadPage from './pages/UploadPage';
import TutorPage from './pages/TutorPage';
import DashboardPage from './pages/DashboardPage';
import AuthPage from './pages/AuthPage';

export default function App() {
  return (
    <div className="min-h-dvh flex flex-col">
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const tabs = [
    { to: '/', label: 'Feed' },
    { to: '/upload', label: 'Upload' },
    { to: '/tutor', label: 'Tutor' },
    { to: '/dashboard', label: 'You' },
  ];
  return (
    <nav className="sticky bottom-0 inset-x-0 bg-ink/90 backdrop-blur border-t border-white/10 grid grid-cols-4 text-sm">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`py-3 text-center ${active ? 'text-accent' : 'text-muted'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
