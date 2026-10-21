import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TicketModel } from '@/lib/public/ticket';

const canvas = vi.hoisted(() => ({
  renderTicket: vi.fn(),
  saveTicket: vi.fn(),
  TICKET_SIZE: { width: 1080, height: 1350 },
}));
vi.mock('@/lib/public/ticketCanvas', () => canvas);

import { SaveTicket } from './SaveTicket';

const model: TicketModel = {
  studio: 'Maison Abeer',
  className: 'Bento cake decorating',
  day: 'Friday, 6 November',
  time: '2:00 pm',
  location: 'Studio A',
};
const blob = new Blob(['png'], { type: 'image/png' });

beforeEach(() => {
  canvas.renderTicket.mockReset();
  canvas.saveTicket.mockReset();
});

describe('SaveTicket', () => {
  it('starts idle', () => {
    render(<SaveTicket model={model} />);
    expect(screen.getByRole('button', { name: 'Save my ticket' })).toBeEnabled();
  });

  it('disables itself while saving', async () => {
    canvas.renderTicket.mockReturnValue(new Promise(() => {}));
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('passes the model and the slugged file name through', async () => {
    canvas.renderTicket.mockResolvedValue(blob);
    canvas.saveTicket.mockResolvedValue('shared');
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));
    await screen.findByRole('button', { name: 'Save my ticket' });
    expect(canvas.renderTicket).toHaveBeenCalledWith(model);
    expect(canvas.saveTicket).toHaveBeenCalledWith(blob, 'bento-cake-decorating-ticket.png');
  });

  it('returns to idle with no alert when the share sheet is dismissed', async () => {
    canvas.renderTicket.mockResolvedValue(blob);
    canvas.saveTicket.mockResolvedValue('cancelled');
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));
    expect(await screen.findByRole('button', { name: 'Save my ticket' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Saved to your/)).toBeNull();
  });

  it('says where it went after a download', async () => {
    canvas.renderTicket.mockResolvedValue(blob);
    canvas.saveTicket.mockResolvedValue('downloaded');
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));
    const note = await screen.findByText('Saved to your photos or downloads');
    expect(note.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers a retry when the picture could not be made', async () => {
    canvas.renderTicket.mockResolvedValue(null);
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t make your ticket just now',
    );
    expect(canvas.saveTicket).not.toHaveBeenCalled();

    canvas.renderTicket.mockResolvedValue(blob);
    canvas.saveTicket.mockResolvedValue('downloaded');
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Saved to your photos or downloads')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('recovers when saving throws, instead of sticking on Saving…', async () => {
    canvas.renderTicket.mockResolvedValue(blob);
    canvas.saveTicket.mockRejectedValue(new Error('download blocked'));
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t make your ticket just now',
    );
    expect(screen.getByRole('button', { name: /Try again/ })).toBeEnabled();
  });

  it('recovers when drawing throws', async () => {
    canvas.renderTicket.mockImplementation(() => {
      throw new Error('canvas unavailable');
    });
    render(<SaveTicket model={model} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save my ticket' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeEnabled();
  });
});
