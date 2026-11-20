import { redirect } from "next/navigation";

export default function SettingsAutomationsRedirect() {
  redirect("/settings?open=automations");
}
