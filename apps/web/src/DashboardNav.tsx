import { useLayoutEffect, useRef, useState } from 'react';

interface NavigationItem {
  id: string;
  title: string;
  href: string;
}

interface IndicatorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function DashboardNav({
  items,
  activeId,
}: {
  items: NavigationItem[];
  activeId: string;
}) {
  const navigation = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<IndicatorBounds | null>(null);

  useLayoutEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!selected) return;
      // Layout offsets ignore hover/press transforms and follow wrapped rows.
      const next = {
        x: selected.offsetLeft,
        y: selected.offsetTop,
        width: selected.offsetWidth,
        height: selected.offsetHeight,
      };
      setIndicator((previous) =>
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    nav.querySelectorAll('a').forEach((link) => observer.observe(link));
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [activeId, items]);

  return (
    <nav
      ref={navigation}
      className="dashboard-nav"
      aria-label="Main navigation"
      data-indicator-ready={indicator !== null}
    >
      {indicator && (
        <span
          className="nav-indicator"
          aria-hidden="true"
          style={{
            transform: `translate(${indicator.x}px, ${indicator.y}px)`,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      )}
      <a className="nav-brand" href="#/things" aria-label="Aura home">
        <span aria-hidden="true">✳</span> Aura
      </a>
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          aria-current={activeId === item.id ? 'page' : undefined}
        >
          {item.title}
        </a>
      ))}
    </nav>
  );
}
