import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GuestRow, avatarTone, initial } from './GuestRow';
import type { Guest } from '@/lib/api/types';

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    full_name: 'Sana R.',
    phone: '03001234567',
    email: null,
    preferred_channel: 'whatsapp',
    opted_out: false,
    is_contactable: true,
    visit_count: 1,
    visit_badge: null,
    is_regular: false,
    birthday: null,
    days_until_birthday: null,
    memory_note: null,
    allergies: [],
    available_credits: 0,
    ...overrides,
  };
}

describe('helpers', () => {
  it('takes the first letter for the avatar', () => {
    expect(initial('Sana R.')).toBe('S');
    expect(initial('  ayesha')).toBe('A');
  });

  it('falls back when a name is empty', () => {
    expect(initial('   ')).toBe('?');
  });

  it('gives a guest the same tone every render', () => {
    // A face changing colour between renders reads as a different person.
    expect(avatarTone('guest-1')).toBe(avatarTone('guest-1'));
  });
});

describe('GuestRow', () => {
  it('shows the name', () => {
    render(<GuestRow guest={guest()} />);
    expect(screen.getByText('Sana R.')).toBeInTheDocument();
  });

  it('shows the visit badge for a returning guest', () => {
    render(<GuestRow guest={guest({ visit_badge: '3rd visit', is_regular: true })} />);
    expect(screen.getByText(/3rd visit/)).toBeInTheDocument();
  });

  it('omits the badge on a first visit', () => {
    render(<GuestRow guest={guest({ visit_badge: null })} />);
    expect(screen.queryByText(/visit/)).not.toBeInTheDocument();
  });

  it('surfaces a critical allergy with a spoken prefix', () => {
    render(
      <GuestRow
        guest={guest({
          allergies: [
            { id: 'a1', label: 'Nut allergy', severity: 'allergy', notes: null, is_critical: true },
          ],
        })}
      />,
    );

    // Health-adjacent information must survive being read aloud.
    expect(screen.getByText('Allergy:')).toHaveClass('sr-only');
    expect(screen.getByText(/Nut allergy/)).toBeInTheDocument();
  });

  it('does not show a non-critical preference as an allergy chip', () => {
    render(
      <GuestRow
        guest={guest({
          allergies: [
            {
              id: 'a1',
              label: 'No coriander',
              severity: 'preference',
              notes: null,
              is_critical: false,
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText('Allergy:')).not.toBeInTheDocument();
  });

  it('flags a birthday inside the window', () => {
    render(<GuestRow guest={guest({ birthday: '1995-08-08', days_until_birthday: 4 })} />);
    expect(screen.getByText(/in 4d/)).toBeInTheDocument();
  });

  it('says "today" on the day itself', () => {
    render(<GuestRow guest={guest({ birthday: '1995-08-04', days_until_birthday: 0 })} />);
    expect(screen.getByText(/today!/)).toBeInTheDocument();
  });

  it('ignores a birthday outside the window', () => {
    render(<GuestRow guest={guest({ birthday: '1995-12-01', days_until_birthday: 119 })} />);
    expect(screen.queryByText(/🎂/)).not.toBeInTheDocument();
  });

  it('badges a guest who cannot be messaged', () => {
    // The PRD requires the host to know to reach them personally.
    render(<GuestRow guest={guest({ is_contactable: false })} />);
    expect(screen.getByText('No messages')).toBeInTheDocument();
  });

  it('shows available rain-check credits, pluralised', () => {
    const { rerender } = render(<GuestRow guest={guest({ available_credits: 1 })} />);
    expect(screen.getByText(/1 credit$/)).toBeInTheDocument();

    rerender(<GuestRow guest={guest({ available_credits: 2 })} />);
    expect(screen.getByText(/2 credits$/)).toBeInTheDocument();
  });

  it('shows the mini-CRM note', () => {
    render(
      <GuestRow
        guest={guest({ memory_note: 'Came with her sister; loved the matcha buttercream' })}
      />,
    );

    expect(screen.getByText(/loved the matcha buttercream/)).toBeInTheDocument();
  });

  it('renders the action slot', () => {
    render(<GuestRow guest={guest()} action={<button type="button">table 2</button>} />);
    expect(screen.getByRole('button', { name: 'table 2' })).toBeInTheDocument();
  });

  it('hides the decorative avatar from assistive technology', () => {
    const { container } = render(<GuestRow guest={guest()} />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('S');
  });
});
