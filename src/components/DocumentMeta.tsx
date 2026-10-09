import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE = 'https://calculatorpc.com';
const DEFAULT_TITLE = 'Construction Project Calculator (CPC)';
const DEFAULT_DESC =
  'Construction Project Calculator (CPC) is a global construction calculator and invoice app with 24 languages, 21 currencies, PDF invoices, receipt tracking and client management.';

type MetaRule = {
  title: string;
  description?: string;
  /** When true, ask search engines not to use this URL as a primary landing page */
  noindex?: boolean;
};

function metaForPath(pathname: string): MetaRule {
  if (pathname === '/privacy') {
    return {
      title: 'Privacy Policy | CPC',
      description: 'Privacy Policy for Construction Project Calculator (CPC).',
      noindex: true,
    };
  }
  if (pathname === '/terms') {
    return {
      title: 'Terms of Service | CPC',
      description: 'Terms of Service for Construction Project Calculator (CPC).',
      noindex: true,
    };
  }
  if (pathname === '/login') {
    return { title: 'Log in | CPC', noindex: true };
  }
  if (pathname === '/signup') {
    return { title: 'Sign up | CPC', noindex: true };
  }
  if (pathname === '/' || pathname === '') {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      noindex: false,
    };
  }
  return { title: `${DEFAULT_TITLE}`, noindex: true };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Keep <title>, canonical, and robots in sync with the SPA route.
 * Stops Google from treating /privacy as the main calculatorpc.com listing.
 */
export function DocumentMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const rule = metaForPath(pathname);
    document.title = rule.title;

    const desc = rule.description || DEFAULT_DESC;
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:title', rule.title);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('name', 'twitter:title', rule.title);
    upsertMeta('name', 'twitter:description', desc);

    // Homepage is the only public landing URL we want indexed as the brand
    const canonical =
      pathname === '/' || pathname === ''
        ? `${SITE}/`
        : `${SITE}${pathname}`;
    upsertCanonical(canonical);
    upsertMeta('property', 'og:url', canonical);

    upsertMeta(
      'name',
      'robots',
      rule.noindex ? 'noindex, follow' : 'index, follow',
    );
  }, [pathname]);

  return null;
}
