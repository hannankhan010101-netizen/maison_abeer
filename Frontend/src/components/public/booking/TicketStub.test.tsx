import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TicketStub } from './TicketStub';

describe('TicketStub', () => {
  it('carries the seats line under "save your seat" on step 1', () => {
    render(<TicketStub current={1} seatsLine="8 seats left this Friday" />);

    const line = screen.getByText('8 seats left this Friday');
    expect(line).toHaveClass('text-sm', 'font-extrabold', 'text-cocoa');
    expect(
      screen.getByText('save your seat').compareDocumentPosition(line) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('leaves the line off once the guest is past step 1', () => {
    render(<TicketStub current={2} seatsLine="8 seats left this Friday" />);
    expect(screen.queryByText('8 seats left this Friday')).not.toBeInTheDocument();
  });

  it('renders nothing extra when there is no line', () => {
    const { container } = render(<TicketStub current={1} seatsLine={null} />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});
