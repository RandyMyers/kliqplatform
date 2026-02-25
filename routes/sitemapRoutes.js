/**
 * Sitemap endpoint: XML with public URLs and hreflang alternates per language.
 * GET /api/sitemap.xml
 */
const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');

const DEFAULT_LANG = 'en';
const SUPPORTED_LANGUAGES = [
  { code: 'en', urlCode: 'en', default: true },
  { code: 'es', urlCode: 'es', default: false },
  { code: 'fr', urlCode: 'fr', default: false },
  { code: 'de', urlCode: 'de', default: false },
];

const PUBLIC_PATHS = [
  '',
  'features',
  'pricing',
  'about',
  'contact',
  'integrations',
  'changelog',
  'blog',
  'careers',
  'documentation',
  'help-center',
  'api-reference',
  'status',
  'privacy',
  'terms',
  'security',
  'login',
  'signup',
];

function getBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return process.env.SITE_URL || `${proto}://${host}`;
}

function locForLang(baseUrl, pathSegment, lang) {
  const path = pathSegment ? `/${pathSegment}` : '/';
  if (lang.default || lang.code === DEFAULT_LANG) return `${baseUrl}${path}`;
  return `${baseUrl}/${lang.urlCode}${path}`;
}

function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req).replace(/\/$/, '');

    const urlEntries = [];

    // Static public paths
    for (const segment of PUBLIC_PATHS) {
      const pathSegment = segment ? `/${segment}` : '/';
      const links = SUPPORTED_LANGUAGES.map((lang) => ({
        hreflang: lang.code,
        href: locForLang(baseUrl, segment, lang),
      }));
      const xDefault = SUPPORTED_LANGUAGES.find((l) => l.default || l.code === DEFAULT_LANG);
      if (xDefault) links.push({ hreflang: 'x-default', href: locForLang(baseUrl, segment, xDefault) });
      urlEntries.push({ pathSegment, links });
    }

    // Blog post slugs (published only)
    const posts = await BlogPost.find({ published: true }).select('slug').lean();
    for (const post of posts) {
      const slug = post.slug || post._id.toString();
      const segment = `blog/${slug}`;
      const links = SUPPORTED_LANGUAGES.map((lang) => ({
        hreflang: lang.code,
        href: locForLang(baseUrl, segment, lang),
      }));
      const xDefault = SUPPORTED_LANGUAGES.find((l) => l.default || l.code === DEFAULT_LANG);
      if (xDefault) links.push({ hreflang: 'x-default', href: locForLang(baseUrl, segment, xDefault) });
      urlEntries.push({ pathSegment: `/${segment}`, links });
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ...urlEntries.flatMap(({ pathSegment, links }) => {
        const loc = pathSegment === '/' ? `${baseUrl}/` : `${baseUrl}${pathSegment}`;
        return [
          '  <url>',
          `    <loc>${escapeXml(loc)}</loc>`,
          ...links.map((l) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(l.hreflang)}" href="${escapeXml(l.href)}"/>`),
          '  </url>',
        ];
      }),
      '</urlset>',
    ].join('\n');

    res.type('application/xml').send(xml);
  } catch (err) {
    res.status(500).type('application/xml').send('<?xml version="1.0"?><error>Failed to generate sitemap</error>');
  }
});

module.exports = router;
