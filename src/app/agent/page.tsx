import { AgentPage } from "@/components/AgentPage";

export default function Agent() {
  // The agent's page is the shop after hours: the sky turns to night while it is open.
  return (
    <div data-sky="night">
      <AgentPage />
    </div>
  );
}
