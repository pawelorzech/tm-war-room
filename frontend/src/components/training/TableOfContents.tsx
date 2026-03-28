'use client';
import { useState, useEffect } from 'react';

const sections = [
  { id: 'getting-started', label: '1. Getting Started' },
  { id: 'gym-formula', label: '2. The Gym Formula' },
  { id: 'happy-jumping', label: '3. Happy Jumping' },
  { id: 'gym-progression', label: '4. Gym Progression' },
  { id: 'energy-management', label: '5. Energy Management' },
  { id: 'stat-enhancers', label: '6. Stat Enhancers' },
  { id: 'company-perks', label: '7. Company Perks' },
  { id: 'merits-books', label: '8. Merits & Books' },
  { id: 'training-break', label: '9. Training Break' },
];

export function TableOfContents() {
  const [activeSection, setActiveSection] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-40 bg-torn-green text-bg-primary p-3 rounded-full shadow-lg"
        aria-label="Table of Contents"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <nav className={`
        fixed top-16 right-0 z-30 bg-bg-secondary/95 backdrop-blur border-l border-torn-green/20
        w-64 h-[calc(100vh-4rem)] overflow-y-auto p-4 transition-transform
        lg:translate-x-0 ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Contents</h2>
        <ul className="space-y-1">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-1.5 text-sm rounded transition-colors ${
                  activeSection === section.id
                    ? 'text-torn-green bg-torn-green/10 font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                }`}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
