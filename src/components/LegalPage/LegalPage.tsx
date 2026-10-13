import type { ReactNode } from 'react';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <main
      aria-label={title}
      className="mx-auto w-full max-w-3xl px-4 py-8 text-[#c8c8e8] sm:px-6 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_a]:underline"
    >
      <h1 className="text-3xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm text-[#9898c8]">Last updated: {lastUpdated}</p>
      {children}
    </main>
  );
}
