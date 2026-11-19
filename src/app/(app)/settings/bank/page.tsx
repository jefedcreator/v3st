import { redirect } from "next/navigation";

export default function SettingsBankRedirect() {
  redirect("/settings?open=bank");
}
