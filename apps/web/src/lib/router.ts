/** 极简 hash 路由（零依赖）：#/path/segments，守卫逻辑在 App 中按路由表执行。 */
import { useEffect, useState } from 'react';

export interface Route {
  name: string;
  segments: string[];
  query: URLSearchParams;
}

function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const segments = (pathPart ?? '/').split('/').filter(Boolean).map(safeDecode);
  return { name: segments[0] ?? 'today', segments, query: new URLSearchParams(queryPart ?? '') };
}

export function navigate(path: string) {
  const target = `#${path}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const PUBLIC_ROUTES = new Set(['login', 'register', 'scan-login']);
