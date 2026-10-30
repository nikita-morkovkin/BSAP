import AudioPlayer from "@/components/audio/AudioPlayer";
import Navigation from "@/components/layout/Navigation";
import Sidebar from "@/components/layout/Sidebar";
import { useUiStore } from "@/store/ui.store";
import CreateProjectView from "@/views/create/CreateProjectView";
import DownloadsPanel from "@/views/downloads/DownloadsPanel";
import MusicLibraryView from "@/views/music/MusicLibraryView";
import ProjectDetailView from "@/views/project/ProjectDetailView";

const App = () => {
  const activeTab = useUiStore((state) => state.activeTab);
  const projectId = useUiStore((state) => state.selectedProjectId);
  const createHidden = activeTab !== "create";

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navigation />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 py-8 sm:p-8 lg:p-10">
          <div hidden={createHidden}>
            <CreateProjectView />
          </div>
          {activeTab === "music" && <MusicLibraryView />}
          {activeTab === "monitor" && projectId && (
            <ProjectDetailView projectId={projectId} />
          )}
          {activeTab === "downloads" && projectId && (
            <DownloadsPanel projectId={projectId} />
          )}
        </main>
        <AudioPlayer />
      </div>
    </div>
  );
};

export default App;
