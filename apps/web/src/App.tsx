import { Route, Routes, useLocation } from 'react-router-dom';
import FeedPage from './pages/FeedPage';
import UploadPage from './pages/UploadPage';
import TutorPage from './pages/TutorPage';
import DashboardPage from './pages/DashboardPage';
import ChapterHubPage from './pages/ChapterHubPage';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { TopHud } from '@/components/gamify/TopHud';
import { AchievementToast } from '@/components/gamify/AchievementToast';
import { BottomNav } from '@/components/BottomNav';

export default function App() {
  const { pathname } = useLocation();
  const isAuthRoute = pathname.startsWith('/auth');
  const showChrome = !isAuthRoute;

  return (
    <div className="min-h-dvh flex flex-col">
      {showChrome && <TopHud />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/doc/:id" element={<ChapterHubPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/reset" element={<ResetPasswordPage />} />
        </Routes>
      </main>
      <AchievementToast />
      {showChrome && <BottomNav />}
    </div>
  );
}
