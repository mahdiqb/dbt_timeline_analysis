import { AppProvider, useApp } from "@/app/store";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MainToolbar } from "@/components/MainToolbar";
import { ReportView } from "@/components/report/ReportView";
import { TimelineView } from "@/components/timeline/TimelineView";
import { HistoricalView } from "@/components/historical/HistoricalView";
import "./App.css";

function ViewRouter() {
  const { view } = useApp();
  if (view === "timeline") return <TimelineView />;
  if (view === "historical") return <HistoricalView />;
  return <ReportView />;
}

export default function App() {
  return (
    <AppProvider>
      <div className="app">
        <Header />
        <div className="app__body">
          <Sidebar />
          <main className="app__main">
            <MainToolbar />
            <div className="app__view">
              <ViewRouter />
            </div>
          </main>
        </div>
      </div>
    </AppProvider>
  );
}
