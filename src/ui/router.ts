type Render = (root: HTMLElement, params: string[]) => void | Promise<void>;

const routes: { parts: string[]; render: Render }[] = [];

/** Регистрирует маршрут вида '/report/:id'. */
export function route(path: string, render: Render): void {
  routes.push({ parts: path.split('/').filter(Boolean), render });
}

export function match(hash: string): { render: Render; params: string[] } | null {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== parts.length) continue;
    const params: string[] = [];
    const ok = r.parts.every((p, i) => {
      if (p.startsWith(':')) { params.push(decodeURIComponent(parts[i])); return true; }
      return p === parts[i];
    });
    if (ok) return { render: r.render, params };
  }
  return null;
}

export function startRouter(root: HTMLElement): void {
  const go = () => {
    const m = match(location.hash) ?? match('#/');
    root.replaceChildren();
    if (m) void m.render(root, m.params);
  };
  window.addEventListener('hashchange', go);
  go();
}

export function navigate(hash: string): void {
  location.hash = hash;
}
