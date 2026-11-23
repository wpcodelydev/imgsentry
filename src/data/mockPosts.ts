import { PLACEHOLDER_IMAGE_URL } from './placeholderImage';
export interface WpPost {
  id: number;
  title: string;
  type: 'post' | 'page' | 'widget' | 'theme_setting';
  status: 'publish' | 'draft';
  content: string;
}

// Sample data for the standalone dev preview only (removed from the production build).
export const MOCK_WP_POSTS: WpPost[] = import.meta.env.DEV ? [
  {
    id: 1,
    title: 'Homepage & Header Customizer Settings',
    type: 'theme_setting',
    status: 'publish',
    content: `<div class="site-header">
      <img src="" class="custom-logo wp-image-101" alt="Site Official Brand Logo 2026" />
      <style>body { font-family: 'Inter Custom Web Font Bold'; }</style>
    </div>`
  },
  {
    id: 12,
    title: 'Corporate Governance & Reports Page',
    type: 'page',
    status: 'publish',
    content: `<article class="page-content">
      <h1>Corporate Governance & Annual Disclosures</h1>
      <p>Please download our latest disclosures below:</p>
      <a href="https://example.com/wp-content/uploads/Q3-Sustainability-Report-2026.pdf" class="wp-block-file__button wp-element-103">Download Q3 Financial & Sustainability Report (PDF)</a>
    </article>`
  },
  {
    id: 24,
    title: 'Tech Discussion Podcast - Episode 42',
    type: 'post',
    status: 'publish',
    content: `<div class="entry-content">
      <h2>Episode 42: Modern Tech & Web Optimization</h2>
      <audio controls class="wp-audio-shortcode wp-audio-106">
        <source type="audio/mpeg" src="https://example.com/wp-content/uploads/ep42-tech-discussion.mp3" />
      </audio>
    </div>`
  },
  {
    id: 35,
    title: 'Draft - New Product Launch Showcase',
    type: 'post',
    status: 'draft',
    content: `<div class="entry-content">
      <p>Draft content for product launch coming soon.</p>
    </div>`
  }
] : [];
