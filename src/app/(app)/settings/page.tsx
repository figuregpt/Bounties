import { requireAuth } from "@/lib/auth";

export default async function SettingsPage() {
  await requireAuth();
  return (
    <div>
      <h1 className="text-h1">Settings</h1>
      <p className="mt-2 text-body text-text-secondary">
        Notification preferences, wallet & account. Coming in Phase 2.
      </p>
    </div>
  );
}
