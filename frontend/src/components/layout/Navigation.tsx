import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useUiStore } from "@/store/ui.store";
import { Moon, Sun } from "lucide-react";

const Navigation = () => {
  const activeTab = useUiStore((state) => state.activeTab);
  const selectedProjectId = useUiStore((state) => state.selectedProjectId);
  const theme = useUiStore((state) => state.theme);
  const projectDisabled = !selectedProjectId;
  const themeLabel =
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  const handleTabChange = (value: unknown) => {
    if (value === "create" || value === "monitor" || value === "downloads") {
      useUiStore.getState().setActiveTab(value);
    }
  };

  const handleThemeToggle = () => {
    useUiStore.getState().toggleTheme();
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b px-4 py-4 sm:px-8">
      <nav aria-label="Studio navigation">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList aria-label="Studio sections">
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="monitor" disabled={projectDisabled}>
              Monitor
            </TabsTrigger>
            <TabsTrigger value="downloads" disabled={projectDisabled}>
              Downloads
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </nav>
      <Button
        variant="outline"
        size="icon"
        aria-label={themeLabel}
        title={themeLabel}
        onClick={handleThemeToggle}
      >
        <ThemeIcon aria-hidden="true" />
      </Button>
    </header>
  );
};

export default Navigation;
