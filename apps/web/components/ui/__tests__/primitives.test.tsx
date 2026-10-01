import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../button';
import { Chip } from '../chip';
import { StatusChip } from '../status-chip';

afterEach(cleanup);

describe('Button', () => {
  it('uses the 6px button radius, never a pill', () => {
    render(<Button>Check it</Button>);
    const btn = screen.getByRole('button', { name: 'Check it' });
    expect(btn.className).toContain('rounded-button');
    expect(btn.className).not.toContain('rounded-full');
  });

  it('defaults to the primary variant on --pencil-blue', () => {
    render(<Button>Check it</Button>);
    expect(screen.getByRole('button').className).toContain('bg-pencil-blue');
  });
});

describe('Chip', () => {
  it('uses the 4px chip radius and keeps its text', () => {
    render(<Chip tone="contradicted">Contradicted</Chip>);
    const chip = screen.getByText('Contradicted');
    expect(chip.className).toContain('rounded-chip');
    expect(chip.dataset.tone).toBe('contradicted');
  });
});

describe('StatusChip', () => {
  it('writes the waking state out with the elapsed seconds it was given', () => {
    render(<StatusChip status="waking" elapsedSeconds={14} />);
    expect(screen.getByRole('status').textContent).toBe('Backend: Waking the desk · 14s');
  });

  it('shows no seconds until the wait is noticeable', () => {
    render(<StatusChip status="waking" elapsedSeconds={1} />);
    expect(screen.getByRole('status').textContent).toBe('Backend: Waking the desk');
  });

  it('says when it will try again and offers Retry while unreachable', () => {
    const retry = vi.fn();
    render(<StatusChip status="unreachable" retryInSeconds={5} onRetry={retry} />);
    expect(screen.getByRole('status').textContent).toContain('Unreachable · retrying in 5s');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('waking shows the lamp, and nothing else that moves', () => {
    const { container } = render(<StatusChip status="waking" />);
    expect(container.querySelector('[data-glyph="lamp"]')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it.each([
    ['ready', 'Ready'],
    ['unreachable', 'Unreachable'],
  ] as const)('announces %s as text, not only as a dot color', (status, text) => {
    render(<StatusChip status={status} />);
    expect(screen.getByRole('status').textContent).toContain(text);
  });
});
