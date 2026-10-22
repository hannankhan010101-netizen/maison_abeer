import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RESULT_COPY } from '@/lib/public/quiz';

import { QuizResult } from './QuizResult';

function setup(share: Parameters<typeof QuizResult>[0]['share'] = 'idle') {
  const handlers = { onBook: vi.fn(), onShare: vi.fn(), onRestart: vi.fn() };
  const view = render(<QuizResult kind="painting" share={share} {...handlers} />);
  return { ...handlers, view };
}

describe('QuizResult', () => {
  it('shows the craft, its mark, vibe and line', () => {
    const { view } = setup();
    expect(screen.getByText('Painting')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: RESULT_COPY.painting.vibe })).toBeInTheDocument();
    expect(screen.getByText(RESULT_COPY.painting.line)).toBeInTheDocument();
    expect(view.container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('wires the three buttons', () => {
    const { onBook, onShare, onRestart } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Book this one' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('says how the share went', () => {
    setup('failed');
    expect(screen.getByRole('status')).toHaveTextContent('would not save');
  });
});
