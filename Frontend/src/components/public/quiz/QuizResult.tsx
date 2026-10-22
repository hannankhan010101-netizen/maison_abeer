import type { Ref } from 'react';

import { StickerCake, StickerPalette, StickerPot } from '@/components/public/CraftStickers';
import { guideFor } from '@/lib/public/craftGuide';
import { RESULT_COPY } from '@/lib/public/quiz';
import type { CraftKind } from '@/lib/public/studioPhotos';

const MARK: Record<CraftKind, typeof StickerCake> = {
  cake: StickerCake,
  pottery: StickerPot,
  painting: StickerPalette,
};

export type ShareState = 'idle' | 'busy' | 'saved' | 'shared' | 'failed';

const SHARE_NOTE: Record<ShareState, string> = {
  idle: '',
  busy: 'Drawing your picture…',
  saved: 'Saved to your photos or downloads',
  shared: 'Shared',
  failed: 'The picture would not save. Try again?',
};

/** The result card: the craft's mark, its vibe line and what to do next. */
export function QuizResult({
  kind,
  share,
  onBook,
  onShare,
  onRestart,
  headingRef,
}: {
  kind: CraftKind;
  share: ShareState;
  onBook: () => void;
  onShare: () => void;
  onRestart: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const Mark = MARK[kind];
  const copy = RESULT_COPY[kind];
  return (
    <div className="quiz-result" data-kind={kind}>
      <Mark className="quiz-mark" />
      <p className="quiz-craft">{guideFor(kind).title}</p>
      <h3 ref={headingRef} tabIndex={-1} className="quiz-vibe font-display">
        {copy.vibe}
      </h3>
      <p className="quiz-line">{copy.line}</p>
      <div className="quiz-actions">
        <button type="button" className="quiz-book" onClick={onBook}>
          Book this one
        </button>
        <button
          type="button"
          className="quiz-share"
          onClick={onShare}
          aria-disabled={share === 'busy'}
        >
          Share to Story
        </button>
        <button type="button" className="quiz-restart" onClick={onRestart}>
          Start again
        </button>
      </div>
      <p className="quiz-note" role="status">
        {SHARE_NOTE[share]}
      </p>
    </div>
  );
}
