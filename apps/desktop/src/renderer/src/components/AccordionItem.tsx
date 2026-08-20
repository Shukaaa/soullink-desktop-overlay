import type { ReactNode } from 'react';

export interface AccordionItemProps {
  /** Used to derive stable DOM ids linking the toggle button to its panel (aria-controls/aria-labelledby). */
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A single collapsible `.panel` section whose title is a real, accessible
 * toggle button (aria-expanded + aria-controls). Open/close state itself is
 * owned by the caller so multiple instances can be coordinated into a single
 * "at most one open" accordion group. */
export function AccordionItem({ id, title, isOpen, onToggle, children }: AccordionItemProps) {
  const buttonId = `accordion-button-${id}`;
  const panelId = `accordion-panel-${id}`;
  return (
    <section className={`panel accordion-item${isOpen ? ' open' : ''}`}>
      <h2>
        <button
          type="button"
          id={buttonId}
          className="accordion-toggle"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span className="accordion-caret" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
        </button>
      </h2>
      {isOpen && (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="accordion-panel">
          {children}
        </div>
      )}
    </section>
  );
}
