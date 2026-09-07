import WorkbenchApp from "@/App";
import { WebsiteSessionProvider } from "@/website-session";
import { agentFeatureConfig } from "@/server/agent/feature-config";

export default function WorkbenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WebsiteSessionProvider>
      <WorkbenchApp agentEnabled={agentFeatureConfig().enabled}>{children}</WorkbenchApp>
    </WebsiteSessionProvider>
  );
}
