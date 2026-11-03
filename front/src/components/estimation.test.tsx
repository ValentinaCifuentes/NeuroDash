import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ConfidenceChip, RiskBadge } from './badges';
import { RiskGauge } from './RiskGauge';

afterEach(cleanup);

describe('RiskGauge', () => {
  it('is an image that says level, value and confidence in words', () => {
    render(<RiskGauge risk="ELEVATED" confidenceLabel="Confianza media" />);

    expect(screen.getByRole('img', { name: 'Índice demostrativo 80 de 100, riesgo elevado, confianza media' })).toBeInTheDocument();
  });

  it('colors only the segment of the current level', () => {
    const { container } = render(<RiskGauge risk="LOW" />);

    const strokes = [...container.querySelectorAll('path')].map((path) => path.getAttribute('stroke'));
    expect(strokes).toEqual(['var(--nd-risk-low)', 'var(--nd-neutral-1)', 'var(--nd-neutral-1)']);
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows a dashed arc and a dash, not a number, when the engine abstains', () => {
    const { container } = render(<RiskGauge risk={null} abstained />);

    expect(container.querySelector('path')).toHaveAttribute('stroke-dasharray', '2 22');
    expect(container.textContent).toBe('—');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('RiskBadge and ConfidenceChip', () => {
  it('labels the risk with its own shape', () => {
    const { container } = render(<RiskBadge risk="MODERATE" />);

    expect(screen.getByText('Riesgo moderado')).toBeInTheDocument();
    expect(container.querySelector('svg.nd-shape circle')).toHaveAttribute('stroke', 'var(--nd-risk-mid)');
  });

  it('keeps confidence on its own axis: dark ink, never a risk color', () => {
    const { container } = render(<ConfidenceChip level="MEDIUM" />);

    expect(screen.getByText('Confianza media')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/--nd-risk/);
  });

  it('says «Información insuficiente» with a dashed mark when there is not enough data', () => {
    const { container } = render(<ConfidenceChip level="INSUFFICIENT" />);

    expect(screen.getByText('Información insuficiente')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('stroke-dasharray', '3 3');
  });
});
