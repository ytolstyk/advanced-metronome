import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';

describe('PrivacyPolicyPage', () => {
  it('renders a main landmark labelled "Privacy Policy"', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('main', { name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('renders the h1 heading', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('shows a last-updated date', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/^Last updated: .+/)).toBeInTheDocument();
  });

  it('renders at least one section heading', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });

  it('discloses that band color names are stored and that any member can change them', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/the names you give a band.s colors \(any member can change them\)/)).toBeInTheDocument();
  });

  it('discloses stored availability, who can read it, and how it is deleted', () => {
    render(<PrivacyPolicyPage />);
    const item = screen.getByText('Band availability:').closest('li')!;
    expect(item).toHaveTextContent(/Only the times you mark free are stored/);
    expect(item).toHaveTextContent(/Anyone with an account who has the band.s link can read them/);
    expect(item).toHaveTextContent(/shared set list/);
    expect(item).toHaveTextContent(/delete your availability at any time/);
    expect(item).toHaveTextContent(/may remain readable until you dismiss the band, and if you never do, until you delete it or ask us to/);
  });

  it('says leaving a band also deletes availability, gear and rig diagrams', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/and we try to delete your availability, gear and rig diagrams too/)).toBeInTheDocument();
  });

  it('discloses stored gear and rig diagrams, who can read them, and how they are deleted', () => {
    render(<PrivacyPolicyPage />);
    const item = screen.getByText('Band gear and rig diagrams:').closest('li')!;
    expect(item).toHaveTextContent(/equipment \(names, ports, specs\)/);
    expect(item).toHaveTextContent(/Anyone with an account who has the band.s link can read them/);
    expect(item).toHaveTextContent(/shared set list/);
    expect(item).toHaveTextContent(/Only you can change or delete your own/);
    expect(item).toHaveTextContent(/deleted when you leave a band/);
    expect(item).toHaveTextContent(/may remain readable until you dismiss the band/);
  });

  it('lists the availability preferences kept in local storage', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/including your availability page preferences and whether you have seen its notice/)).toBeInTheDocument();
  });
});
