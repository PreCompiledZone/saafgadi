import { Navigate, Route, Routes } from 'react-router-dom';
import { LinkButton } from './components/ui';
import { AdminLayout } from './layouts/AdminLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { UserLayout } from './layouts/UserLayout';
import { WasherLayout } from './layouts/WasherLayout';
import { HOME_FOR, RequireRole, useSession } from './lib/auth';
import { Activate } from './pages/admin/Activate';
import { Admins } from './pages/admin/Admins';
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminEnquiries } from './pages/admin/Enquiries';
import { Payments } from './pages/admin/Payments';
import { AdminPlans } from './pages/admin/Plans';
import { AdminProfile } from './pages/admin/Profile';
import { AdminSettings } from './pages/admin/Settings';
import { Subscriptions } from './pages/admin/Subscriptions';
import { UserDetail } from './pages/admin/UserDetail';
import { Users } from './pages/admin/Users';
import { AdminVehicles } from './pages/admin/Vehicles';
import { Washers } from './pages/admin/Washers';
import { Societies, SocietyDetailPage } from './pages/admin/Societies';
import { WashLogs } from './pages/admin/WashLogs';
import { Landing } from './pages/public/Landing';
import { Login } from './pages/public/Login';
import { PlansPage } from './pages/public/PlansPage';
import { Signup } from './pages/public/Signup';
import { BookPlan } from './pages/user/BookPlan';
import { Dashboard } from './pages/user/Dashboard';
import { Enquiries } from './pages/user/Enquiries';
import { History } from './pages/user/History';
import { Plans } from './pages/user/Plans';
import { Profile } from './pages/user/Profile';
import { Vehicles } from './pages/user/Vehicles';
import { Welcome } from './pages/user/Welcome';
import { WasherHistory } from './pages/washer/History';
import { WasherProfile } from './pages/washer/Profile';
import { Today } from './pages/washer/Today';

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return null;
  return user ? <Navigate to={HOME_FOR[user.role]} replace /> : <>{children}</>;
}

function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-center px-6">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted">That link doesn’t go anywhere.</p>
      <LinkButton to="/" variant="cta">
        Go home
      </LinkButton>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="plans" element={<PlansPage />} />
        <Route
          path="login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="signup"
          element={
            <GuestOnly>
              <Signup />
            </GuestOnly>
          }
        />
      </Route>

      <Route
        path="app"
        element={
          <RequireRole role="USER">
            <UserLayout />
          </RequireRole>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="history" element={<History />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="plans" element={<Plans />} />
        <Route path="plans/:planId/book" element={<BookPlan />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route
        path="washer"
        element={
          <RequireRole role="WASHER">
            <WasherLayout />
          </RequireRole>
        }
      >
        <Route index element={<Today />} />
        <Route path="history" element={<WasherHistory />} />
        <Route path="profile" element={<WasherProfile />} />
      </Route>

      <Route
        path="admin"
        element={
          <RequireRole role="ADMIN">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="subscriptions/activate" element={<Activate />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="washers" element={<Washers />} />
        <Route path="societies" element={<Societies />} />
        <Route path="societies/:id" element={<SocietyDetailPage />} />
        <Route path="vehicles" element={<AdminVehicles />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="payments" element={<Payments />} />
        <Route path="wash-logs" element={<WashLogs />} />
        <Route path="enquiries" element={<AdminEnquiries />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="admins" element={<Admins />} />
        <Route path="profile" element={<AdminProfile />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
