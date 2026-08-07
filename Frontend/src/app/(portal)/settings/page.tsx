import { SettingsForm } from '@/components/domain/SettingsForm';

export const metadata = { title: 'Settings · Maison Abeer' };

export default function SettingsPage() {
  return (
    <section>
      <h1 className="font-display text-[clamp(26px,4vw,34px)]">Settings</h1>
      <p className="text-latte mb-5">How your studio sounds and when it speaks</p>
      <SettingsForm />
    </section>
  );
}
