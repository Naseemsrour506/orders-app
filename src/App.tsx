import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Empty, useToast } from "./components/ui";
import { useAuth } from "./lib/auth";
import { DesignerHome } from "./pages/DesignerHome";
import { FieldHome } from "./pages/FieldHome";
import { Join } from "./pages/Join";
import { ManagerHome } from "./pages/ManagerHome";
import { NewOrder } from "./pages/NewOrder";
import { OrderPage } from "./pages/OrderPage";
import { SharePage } from "./pages/SharePage";
import { Teams } from "./pages/Teams";
import { Users } from "./pages/Users";
import { Welcome } from "./pages/Welcome";

function Home() {
  const { me } = useAuth();
  if (me?.role === "manager") return <ManagerHome />;
  if (me?.role === "designer") return <DesignerHome />;
  return <FieldHome />;
}

export function App() {
  const { me, loading } = useAuth();
  const toast = useToast();
  const loc = useLocation();

  useEffect(() => {
    const w = (loc.state as { welcome?: string } | null)?.welcome;
    if (w) toast(w);
  }, [loc.state, toast]);

  if (loc.pathname === "/join") return <Join />;
  if (!me) return loading ? <Empty>טוען…</Empty> : <Welcome />;

  const manager = me.role === "manager";
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/order/:id" element={me.role === "field" ? <Navigate to="/" replace /> : <OrderPage />} />
      <Route path="/share" element={<SharePage />} />
      {manager && <Route path="/new" element={<NewOrder />} />}
      {manager && <Route path="/teams" element={<Teams />} />}
      {manager && <Route path="/users" element={<Users />} />}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
