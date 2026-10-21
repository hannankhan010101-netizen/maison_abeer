import type { CraftKind } from './studioPhotos';

/**
 * What the storefront teaches about each craft.
 *
 * General craft knowledge only: how cake decorating, pottery and painting
 * work anywhere. Nothing here promises anything about the studio. Whatever
 * only the studio can answer (prices, ages, cancelling, how long a piece takes
 * to be ready) is an `owner` entry with `a: null`, which `visibleFaq` hides
 * until the owner writes the answer in. Adding a fact is a data edit.
 */

export interface GuideTool {
  id: string;
  name: string;
  /** One sentence, what the tool is for. */
  does: string;
}

export interface GuideStep {
  id: string;
  title: string;
  text: string;
}

export interface GuideFaq {
  id: string;
  q: string;
  /** `null` means unanswered: the owner's to fill in, and never shown. */
  a: string | null;
  owner?: true;
}

export interface CraftGuide {
  kind: CraftKind;
  title: string;
  blurb: string;
  /** What the craft is, in a few short phrases. Not a promise about any one class. */
  makes: string[];
  tools: GuideTool[];
  steps: GuideStep[];
  tips: string[];
  funFacts: string[];
  bring: string[];
  faq: GuideFaq[];
}

const cake: CraftGuide = {
  kind: 'cake',
  title: 'Bento cakes',
  blurb: 'Tiny lunchbox-sized cakes you frost, pipe and decorate yourself.',
  makes: [
    'A mini cake about the size of a lunchbox',
    'Smooth buttercream, piped borders and swirls',
    'A short message written on top',
  ],
  tools: [
    {
      id: 'piping-bag',
      name: 'Piping bag and tips',
      does: 'Shapes buttercream into borders, dots, swirls and tiny flowers.',
    },
    {
      id: 'offset-spatula',
      name: 'Offset spatula',
      does: 'Spreads and smooths frosting across the top and sides.',
    },
    {
      id: 'bench-scraper',
      name: 'Bench scraper',
      does: 'Gives the sides a clean, straight finish.',
    },
    {
      id: 'turntable',
      name: 'Turntable',
      does: 'Lets you spin the cake while you smooth it.',
    },
    {
      id: 'gel-colours',
      name: 'Gel colours',
      does: 'Add strong colour without thinning the buttercream.',
    },
  ],
  steps: [
    {
      id: 'crumb',
      title: 'Level and crumb coat',
      text: 'Trim the top so it sits flat, then spread a thin first layer to trap the crumbs.',
    },
    {
      id: 'chill',
      title: 'Chill',
      text: 'A short rest in the fridge firms the cake so the next layer goes on smoothly.',
    },
    {
      id: 'smooth',
      title: 'Smooth coat',
      text: 'Add the final layer, then spin the turntable and scrape for clean edges.',
    },
    {
      id: 'pipe',
      title: 'Colour and pipe',
      text: 'Tint your buttercream with gel colour and pipe borders, dots and swirls.',
    },
    {
      id: 'write',
      title: 'Write and box',
      text: 'Write a tiny message slowly and steadily, then carry the box level.',
    },
  ],
  tips: [
    'A cold cake gives smoother edges.',
    'Gel colour beats liquid: a stronger shade and less mess.',
    'Butter at room temperature pipes best.',
    'Bento cakes usually contain eggs, dairy and gluten, and can touch nuts. Always tell the studio about allergies before you come.',
  ],
  funFacts: [
    'Bento is the Japanese word for a boxed lunch, and these cakes are small enough for one.',
    'Buttercream behaves best when it is not too warm, so a cool room is a decorator’s friend.',
    'One star-shaped piping tip can make a swirl, a rope or a rosette.',
  ],
  bring: [
    'Hair tied back if it is long',
    'Short nails, or nails you do not mind',
    'Comfy clothes you can lean over a table in',
    'A way to carry your cake home',
    'Your phone for photos',
  ],
  faq: [
    {
      id: 'cake-take-home',
      q: 'Can I take my cake home?',
      a: null,
      owner: true,
    },
    {
      id: 'cake-experience',
      q: 'Do I need any experience?',
      a: null,
      owner: true,
    },
  ],
};

const pottery: CraftGuide = {
  kind: 'pottery',
  title: 'Pottery',
  blurb: 'Shaping clay by hand or on the wheel, from a lump to a little vessel.',
  makes: [
    'Bowls, cups and small vases',
    'Thrown on a wheel or built by hand',
    'Pieces that are fired and glazed after they dry',
  ],
  tools: [
    {
      id: 'wheel',
      name: 'Potter’s wheel',
      does: 'Spins the clay so you can pull it up into a round shape.',
    },
    {
      id: 'sponge',
      name: 'Sponge',
      does: 'Keeps the clay wet and smooths the surface.',
    },
    {
      id: 'wire-cutter',
      name: 'Wire cutter',
      does: 'Slices clay from a block and frees a finished piece from the wheel.',
    },
    {
      id: 'rib',
      name: 'Rib',
      does: 'A flat tool that shapes and smooths the walls.',
    },
    {
      id: 'needle-tool',
      name: 'Needle tool',
      does: 'Marks guide lines and trims the rim.',
    },
    {
      id: 'trimming-tool',
      name: 'Trimming tool',
      does: 'Carves away extra clay from the base once the piece has firmed up.',
    },
  ],
  steps: [
    {
      id: 'wedge',
      title: 'Wedge',
      text: 'Knead the clay to push out air bubbles and even out how soft it is.',
    },
    {
      id: 'centre',
      title: 'Centre',
      text: 'Press the clay into the exact middle of the spinning wheel.',
    },
    {
      id: 'open',
      title: 'Open and pull',
      text: 'Open a hole in the middle, then lift the walls with slow, steady hands.',
    },
    {
      id: 'shape',
      title: 'Shape',
      text: 'Ease it into a bowl, a cup or a vase, keeping your hands wet.',
    },
    {
      id: 'fire',
      title: 'Dry, fire and glaze',
      text: 'After it dries, a piece is fired, glazed and fired again in a kiln.',
    },
  ],
  tips: [
    'Wet hands are your friend: dry clay drags.',
    'Slow and steady wins. The wheel rewards calm hands.',
    'Wobbles happen to everyone, and centring is the hardest part.',
    'Take rings off before you start, and tie long hair back.',
  ],
  funFacts: [
    'Clay shrinks as it dries and shrinks again as it is fired.',
    'Glaze often looks chalky and pale before firing. The real colour appears in the kiln.',
    'The first firing, before glaze, is called a bisque firing.',
  ],
  bring: [
    'Clothes you do not mind getting muddy',
    'Short nails, or nails you do not mind',
    'A hair tie',
    'A small towel for your hands',
    'Your phone for photos',
  ],
  faq: [
    {
      id: 'pottery-why-wait',
      q: 'Why is a piece not ready the same day?',
      a: 'Clay has to dry slowly and then be fired in a kiln, sometimes twice, so it cannot be finished in one sitting.',
    },
    {
      id: 'pottery-ready',
      q: 'When will my piece be ready?',
      a: null,
      owner: true,
    },
    {
      id: 'pottery-experience',
      q: 'Do I need any experience?',
      a: null,
      owner: true,
    },
  ],
};

const painting: CraftGuide = {
  kind: 'painting',
  title: 'Painting',
  blurb: 'Colour and brushwork on ceramic or canvas, depending on the class.',
  makes: [
    'A painted piece in your own colours',
    'Soft washes, bold dots and tiny details',
    'Ceramic or canvas, depending on the class',
  ],
  tools: [
    {
      id: 'round-brush',
      name: 'Round brush',
      does: 'Makes dots, petals and strokes that start thin and swell.',
    },
    {
      id: 'flat-brush',
      name: 'Flat brush',
      does: 'Covers larger areas and makes crisp edges.',
    },
    {
      id: 'liner-brush',
      name: 'Liner brush',
      does: 'Long bristles that hold paint for one smooth, thin line.',
    },
    {
      id: 'palette',
      name: 'Palette',
      does: 'Where you mix colours before they meet the piece.',
    },
    {
      id: 'water-cup',
      name: 'Water cup',
      does: 'Rinses your brush between colours so they stay clean.',
    },
  ],
  steps: [
    {
      id: 'sketch',
      title: 'Sketch lightly',
      text: 'Draw your idea very faintly so you know where the shapes go.',
    },
    {
      id: 'base',
      title: 'Base coats',
      text: 'Fill the biggest shapes first with flat, even colour.',
    },
    {
      id: 'dry',
      title: 'Let it dry',
      text: 'Wait until a layer is dry to the touch so colours do not smudge.',
    },
    {
      id: 'layer',
      title: 'Add layers',
      text: 'Build up shading and pattern on top, one thin layer at a time.',
    },
    {
      id: 'details',
      title: 'Details last',
      text: 'Finish with the tiniest lines, dots and highlights.',
    },
  ],
  tips: [
    'Let each layer dry before the next so colours stay clean.',
    'Add a little white to any colour to make a pastel.',
    'Start with the biggest shapes and finish with the tiniest details.',
    'There is no wrong colour: mistakes can be painted over once they dry.',
  ],
  funFacts: [
    'Red, yellow and blue, mixed in different amounts, make most other colours.',
    'A liner brush has long bristles so it can hold enough paint for one long, thin line.',
    'Painting a wet layer over a dry one keeps the edges crisp.',
  ],
  bring: [
    'Clothes you do not mind a splash on',
    'Hair tied back',
    'A few colours you love in mind',
    'Patience for drying time',
    'Your phone for photos',
  ],
  faq: [
    {
      id: 'painting-experience',
      q: 'Do I need to be good at art?',
      a: null,
      owner: true,
    },
  ],
};

export const CRAFT_GUIDES: Record<CraftKind, CraftGuide> = { cake, pottery, painting };

/** Questions every class gets. Most are the studio's to answer. */
export const COMMON_FAQ: GuideFaq[] = [
  {
    id: 'allergies',
    q: 'I have an allergy. What do I do?',
    a: 'Say so on the booking form. There is a field for allergies so the studio knows before you arrive.',
  },
  {
    id: 'full',
    q: 'What if the class is full?',
    a: 'You can join the waitlist. If a seat opens up, you are messaged straight away.',
  },
  { id: 'pay', q: 'How do I pay?', a: null, owner: true },
  { id: 'cancel', q: 'Can I cancel or move my seat?', a: null, owner: true },
  { id: 'age', q: 'Is there an age limit?', a: null, owner: true },
  { id: 'friend', q: 'Can I come with a friend?', a: null, owner: true },
];

export function guideFor(kind: CraftKind): CraftGuide {
  return CRAFT_GUIDES[kind];
}

/** Only entries that have an answer. An unanswered `owner` entry is never shown. */
export function visibleFaq(entries: readonly GuideFaq[]): GuideFaq[] {
  return entries.filter((entry) => typeof entry.a === 'string' && entry.a.trim().length > 0);
}
