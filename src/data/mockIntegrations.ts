import { IntegrationInfo } from '../types';

/**
 * Preview-only list (standalone mode, no window.imgsentry_data). In WordPress the real list comes from PHP
 * (ImgSentry_Integrations::get_supported_plugins). Same ids, names and texts as the PHP side.
 */
export const MOCK_INTEGRATIONS: IntegrationInfo[] = import.meta.env.DEV ? [
  { id: 'elementor', name: 'Elementor', status: 'active', desc: 'Reads Elementor layouts and re-checks a page when it is saved.' },
  { id: 'woocommerce', name: 'WooCommerce', status: 'active', desc: 'Reads product gallery images and re-checks a product when it is saved.' },
  { id: 'divi', name: 'Divi', status: 'inactive', desc: 'Reads Divi shortcodes and image URLs inside page content.' },
  { id: 'beaver', name: 'Beaver Builder', status: 'inactive', desc: 'Reads Beaver Builder layout data (image IDs and URLs).' },
  { id: 'wpbakery', name: 'WPBakery', status: 'inactive', desc: 'Reads single image IDs in WPBakery shortcodes.' },
  { id: 'acf', name: 'Advanced Custom Fields', status: 'active', desc: 'Reads fields named image, gallery, photo and similar. Add other names below.' },
  { id: 'wpml', name: 'WPML', status: 'inactive', desc: 'Counts usage across translated posts and media.' },
  { id: 'polylang', name: 'Polylang', status: 'active', desc: 'Counts usage across translated posts and media.' },
  { id: 'blocks', name: 'Block editor', status: 'builtin', desc: 'Reads image, gallery, cover and media-text blocks.' },
  { id: 'widgets', name: 'Widgets and Customizer', status: 'builtin', desc: 'Reads widgets, site logo, site icon and header image.' },
] : [];
