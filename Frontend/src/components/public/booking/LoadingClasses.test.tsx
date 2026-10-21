import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingClasses } from './LoadingClasses';

describe('LoadingClasses', () => {
  it('is a status announcing the load, with three ticket-shaped placeholders', () => {
    render(<LoadingClasses />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading classes');
    expect(status.querySelectorAll('[data-skeleton="ticket"]')).toHaveLength(3);
  });

  it('shimmers through a stylesheet class that reduced motion switches off', () => {
    render(<LoadingClasses />);
    expect(screen.getByRole('status').querySelectorAll('.booking-shimmer').length).toBeGreaterThan(
      0,
    );
  });
});
