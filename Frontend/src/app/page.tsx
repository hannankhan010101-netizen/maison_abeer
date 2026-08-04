import { AlertCard } from '@/components/ui/AlertCard';
import { Button } from '@/components/ui/Button';
import { CapacityRing } from '@/components/ui/CapacityRing';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icing } from '@/components/ui/Icing';

/**
 * Component gallery.
 *
 * A temporary route that renders the primitives against real token values so
 * they can be checked in a browser at every breakpoint. It is replaced by the
 * dashboard once the Sessions and Guests APIs land.
 */
export default function Page() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <h1 className="font-display text-[clamp(26px,4vw,34px)]">good morning, zara ✨</h1>
      <p className="text-latte mb-6">
        it&rsquo;s kiln day — <HandNote>2 things need you before noon</HandNote>
      </p>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-4">
          <Card>
            <Eyebrow>next up · saturday 2:00 pm</Eyebrow>

            {/* Stacks on a phone, sits side by side from `sm` up. */}
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <CapacityRing booked={8} seats={10} />
              <div>
                <CardTitle>saturday&rsquo;s bento cake session</CardTitle>
                <p className="text-latte text-[13.5px]">sat, aug 8 · 2:00–4:30 pm · studio a</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip tone="pink">filling fast 🔥</Chip>
                  <Chip tone="butter">waitlist open</Chip>
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button>print name tags</Button>
              <Button variant="secondary">view guest list</Button>
              <Button variant="secondary">adjust seats</Button>
            </div>
          </Card>

          <Card>
            <Eyebrow>prep for saturday</Eyebrow>
            <CardTitle>4 of 6 steps done — nearly there!</CardTitle>
            <Icing value={4} max={6} label="Prep for Saturday" className="mt-3" />
          </Card>
        </div>

        <div className="grid content-start gap-3">
          <Eyebrow>alerts &amp; nudges</Eyebrow>
          <AlertCard
            tone="critical"
            icon="🔥"
            title="kiln alert"
            description="load saturday's clay pieces by 6 pm today"
            action={
              <Button variant="secondary" size="sm">
                mark loaded
              </Button>
            }
          />
          <AlertCard
            tone="warning"
            icon="🪑"
            title="2 guests need tables"
            description="assign before printing tags"
            action={
              <Button variant="secondary" size="sm">
                assign
              </Button>
            }
          />
          <AlertCard
            tone="gentle"
            icon="💌"
            title="waitlist +1"
            description="hira joined for saturday"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone="allergy" srPrefix="Allergy:">
              ⚠️ nut allergy
            </Chip>
            <Chip tone="terra">pottery</Chip>
            <Chip tone="sage">ceramic painting</Chip>
          </div>
        </div>
      </div>
    </main>
  );
}
