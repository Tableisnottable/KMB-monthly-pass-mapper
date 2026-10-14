'use client';

export function LocateButton() {
  function locate() {
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dispatchEvent(new CustomEvent('tc:locate'));
  }

  return (
    <button
      className="rounded-full bg-cm-ink px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-black"
      onClick={locate}
      type="button"
    >
      定位
    </button>
  );
}
