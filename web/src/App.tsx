import { useEffect, useState } from "react";
import Brief from "./components/Brief";
import CommandPalette from "./components/CommandPalette";
import Dashboard from "./components/Dashboard";
import MethodDrawer from "./components/MethodDrawer";
import SourceDrawer from "./components/SourceDrawer";
import Tour from "./components/Tour";
import { loadDataset } from "./data/load";
import type { Dataset } from "./data/types";
import { StoreProvider, useStore } from "./state/store";

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [route, setRoute] = useState(location.hash);

  useEffect(() => {
    loadDataset().then(setData).catch((e) => setErr(String(e.message ?? e)));
    const onHash = () => setRoute(location.hash);
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  if (err)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold">The project data didn't load.</p>
          <p className="mt-1 text-fg-2">{err}. Run <code className="num">python pipeline/run_all.py</code>, then reload.</p>
        </div>
      </div>
    );
  if (!data) return <Loading />;
  if (route.startsWith("#/brief/")) return <Brief data={data} pairId={decodeURIComponent(route.slice(8))} />;
  return (
    <StoreProvider data={data}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch({ type: "palette", on: !state.palette });
      } else if (e.key === "Escape") {
        if (state.palette) dispatch({ type: "palette", on: false });
        else if (state.tourStep != null) dispatch({ type: "tour", step: null });
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [dispatch, state.palette, state.tourStep]);

  return (
    <div className="h-full overflow-y-auto">
      <Dashboard />
      {state.drawer === "source" && <SourceDrawer />}
      {state.drawer === "method" && <MethodDrawer />}
      {state.tourStep != null && <Tour />}
      {state.palette && <CommandPalette />}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-3 text-fg-2">
        <span className="h-2 w-2 animate-ping rounded-full bg-desc" />
        Loading both utilities' plans…
      </div>
    </div>
  );
}
