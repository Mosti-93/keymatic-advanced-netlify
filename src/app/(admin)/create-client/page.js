import { redirect } from "next/navigation";

// The old "Create Client" page was a placeholder that never saved anything.
// Clients are managed on /add-client.
export default function CreateClientPage() {
  redirect("/add-client");
}
