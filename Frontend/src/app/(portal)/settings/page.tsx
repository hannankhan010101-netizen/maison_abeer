import { SettingsForm } from '@/components/domain/SettingsForm';

export const metadata = { title: 'Settings · Maison Abeer' };

export default function SettingsPage() {
  return (
    <section>
      <h1 className="font-display text-[clamp(21px,4vw,34px)]">Settings</h1>
      {/* The subtitle is scene-setting on a screen that is already long.
          Kept where there is room, dropped where every pixel pushes the first
          control further down. */}
      <p className="text-latte mb-3 hidden text-sm sm:block lg:mb-5 lg:text-base">
        How your studio sounds and when it speaks
      </p>
      <div className="mb-3 sm:hidden" />
      <SettingsForm />
    </section>
  );
}
