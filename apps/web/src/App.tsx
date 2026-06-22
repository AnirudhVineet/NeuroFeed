import { Route, Routes, useLocation } from 'react-router-dom';
import FeedPage from './pages/FeedPage';
import UploadPage from './pages/UploadPage';
import TutorPage from './pages/TutorPage';
import DashboardPage from './pages/DashboardPage';
import ChapterHubPage from './pages/ChapterHubPage';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PathsPage from './pages/PathsPage';
import ProfilePage from './pages/ProfilePage';
import DiscoverPage from './pages/DiscoverPage';
import FriendsPage from './pages/FriendsPage';
import ChallengePage from './pages/ChallengePage';
import ActivityFeedPage from './pages/ActivityFeedPage';
import LeaderboardPage from './pages/LeaderboardPage';
import BadgesPage from './pages/BadgesPage';
import PrivacySettingsPage from './pages/PrivacySettingsPage';
import { TopHud } from '@/components/gamify/TopHud';
import { AchievementToast } from '@/components/gamify/AchievementToast';
import { BottomNav } from '@/components/BottomNav';
import { useSocialBootstrap } from '@/lib/social';

export default function App() {
  const { pathname } = useLocation();
  const isAuthRoute = pathname.startsWith('/auth');
  const showChrome = !isAuthRoute;
  useSocialBootstrap();

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
          <Route path="/paths" element={<PathsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/me" element={<ProfilePage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/challenge" element={<ChallengePage />} />
          <Route path="/activity" element={<ActivityFeedPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/badges" element={<BadgesPage />} />
          <Route path="/settings/privacy" element={<PrivacySettingsPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/reset" element={<ResetPasswordPage />} />
        </Routes>
      </main>
      <AchievementToast />
      {showChrome && <BottomNav />}
    </div>
  );
}
