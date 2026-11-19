'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PlannerIcon } from './PlannerIcon';

/** Native modal supplies focus isolation, Escape and focus return. */
export function ChoiceDialog({ label, title, children, className = '', closeLabel }: {
  label: ReactNode; title: string; children: (close: () => void) => ReactNode; className?: string; closeLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && ref.current && !ref.current.open) ref.current.showModal(); }, [open]);
  const close = () => ref.current?.close();
  return <div className={`choice-control ${className}`}>
    <button type="button" className="choice-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id + '-dialog'} onClick={() => setOpen(true)}>{label}<PlannerIcon name="chevron" size={14} /></button>
    <dialog ref={ref} id={id + '-dialog'} className="choice-dialog" aria-labelledby={id} onClose={event => { if (event.target === event.currentTarget) setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}>
      <header className="choice-heading"><h2 id={id}>{title}</h2><button type="button" onClick={close} aria-label={closeLabel}><PlannerIcon name="close" /></button></header>
      <div className="choice-body">{open ? children(close) : null}</div>
    </dialog>
  </div>;
}
