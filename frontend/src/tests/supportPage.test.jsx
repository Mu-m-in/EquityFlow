import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SupportPage from '../landing_page/support/SupportPage';

describe('SupportPage', () => {
  it('renders the support heading and contact form', () => {
    render(<SupportPage />);

    expect(screen.getByText(/Support Center/i)).toBeInTheDocument();
    expect(screen.getByText(/Send us a message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit ticket/i })).toBeInTheDocument();
  });
});
