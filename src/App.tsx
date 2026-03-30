import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const UsersPage = lazy(() => import("@/pages/users"));
const ComputersPage = lazy(() => import("@/pages/computers"));
const GroupsPage = lazy(() => import("@/pages/groups"));
const DirectoryPage = lazy(() => import("@/pages/directory"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const SettingsPage = lazy(() => import("@/pages/settings"));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/computers" element={<ComputersPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
