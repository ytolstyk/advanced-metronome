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

  it('says leaving a band also deletes availability, gear, rig diagrams and click tracks', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/and we try to delete your availability, gear, rig diagrams and click tracks too/)).toBeInTheDocument();
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

  it('discloses band click tracks, who can read them, who can change them, and how they are deleted', () => {
    render(<PrivacyPolicyPage />);
    const item = screen.getByText('Band click tracks:').closest('li')!;
    expect(item).toHaveTextContent(/tempo and time-signature segments/);
    expect(item).toHaveTextContent(/Anyone with an account who has the band.s link can read them/);
    expect(item).toHaveTextContent(/shared set list/);
    expect(item).toHaveTextContent(/Any member can replace or remove the click track shown on a song/);
    expect(item).toHaveTextContent(/the owner can ban a member/);
    expect(item).toHaveTextContent(/deleted when you leave a band/);
    expect(item).toHaveTextContent(/may remain readable until you dismiss the band/);
    expect(item).toHaveTextContent(/saved click tracks \(not attached to a band\) stay private/);
  });

  it('shows the October 31, 2026 last-updated date', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText('Last updated: October 31, 2026')).toBeInTheDocument();
  });

  it('says playing or downloading a click track as WAV or FLAC happens in the browser and is not uploaded', () => {
    render(<PrivacyPolicyPage />);
    const item = screen.getByText('Band click tracks:').closest('li')!;
    expect(item).toHaveTextContent(/Playing a click track, or downloading it as a WAV or FLAC file, happens in your browser/);
    expect(item).toHaveTextContent(/the audio is made on your device and is not uploaded/);
  });

  it('discloses that imported Guitar Pro and AlphaTex files stay local and only saved, published or attached content reaches the cloud', () => {
    render(<PrivacyPolicyPage />);
    const item = screen.getByText('Files you import (local only):').closest('li')!;
    expect(item).toHaveTextContent(/Guitar Pro and AlphaTex files/);
    expect(item).toHaveTextContent(/read in your browser and are not uploaded/);
    expect(item).toHaveTextContent(/Only what you then choose to save, publish or attach to a band is stored in the cloud/);
  });

  it('lists open-source browser libraries under third-party services and points to the Terms for licences', () => {
    render(<PrivacyPolicyPage />);
    const item = screen.getByText(/Open-source libraries, such as alphaTab/).closest('li')!;
    expect(item).toHaveTextContent(/alphaTab/);
    expect(item).toHaveTextContent(/run in your browser and send nothing anywhere/);
    expect(item).toHaveTextContent(/Their licences are listed in the Terms of Service/);
    const heading = screen.getByRole('heading', { level: 2, name: 'Third-party services' });
    const list = heading.nextElementSibling!;
    expect(list).toContainElement(item);
  });

  it('lists the availability preferences kept in local storage', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/including your availability page preferences and whether you have seen its notice/)).toBeInTheDocument();
  });
});
