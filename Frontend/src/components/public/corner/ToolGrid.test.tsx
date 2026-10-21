import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion', () => ({ useMotionTier: () => 0, haptic: vi.fn() }));

import { guideFor } from '@/lib/public/craftGuide';

import { ToolGrid } from './ToolGrid';

const tools = guideFor('pottery').tools;

describe('ToolGrid', () => {
  it('renders every tool as a collapsed button', () => {
    render(<ToolGrid tools={tools} />);
    for (const tool of tools) {
      const button = screen.getByRole('button', { name: tool.name });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText(tool.does)).toBeNull();
    }
  });

  it('toggles a tool card open and closed', () => {
    render(<ToolGrid tools={tools} />);
    const button = screen.getByRole('button', { name: tools[0]!.name });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(tools[0]!.does)).toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(tools[0]!.does)).toBeNull();
  });

  it('opens one card at a time', () => {
    render(<ToolGrid tools={tools} />);
    fireEvent.click(screen.getByRole('button', { name: tools[0]!.name }));
    fireEvent.click(screen.getByRole('button', { name: tools[1]!.name }));
    expect(screen.queryByText(tools[0]!.does)).toBeNull();
    expect(screen.getByText(tools[1]!.does)).toBeVisible();
  });

  it('closes on Escape and returns focus to the tool', () => {
    render(<ToolGrid tools={tools} />);
    const button = screen.getByRole('button', { name: tools[2]!.name });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    expect(screen.queryByText(tools[2]!.does)).toBeNull();
  });
});
