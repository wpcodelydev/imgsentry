import { ExclusionItem } from '../types';

/**
 * Pre-seeded sensible default folder exclusions created on plugin activation.
 */
export const DEFAULT_EXCLUDED_FOLDERS: ExclusionItem[] = [
  { id: 'ef-0', path: '/wp-content/uploads/imgsentry/backups/', isPreSeeded: true, note: 'Isolated plugin backup directory — automatically excluded from scans', category: 'folder' },
  { id: 'ef-trash', path: '/wp-content/uploads/imgsentry/trash/', isPreSeeded: true, note: 'Isolated plugin trash directory — automatically excluded from scans', category: 'folder' },
  { id: 'ef-1', path: '/wp-content/uploads/cache/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-2', path: '/wp-content/uploads/backup/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-3', path: '/wp-content/uploads/backups/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-5', path: '/wp-content/uploads/wc-logs/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-7', path: '/wp-content/uploads/elementor/css/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-8', path: '/wp-content/uploads/wpo-cache/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-9', path: '/wp-content/uploads/wp-rocket-cache/', isPreSeeded: true, note: 'Added automatically — recommended', category: 'folder' },
  { id: 'ef-11', path: '/wp-content/uploads/wpforms/', isPreSeeded: true, note: 'Added automatically — recommended (WPForms entry attachments)', category: 'folder' }
];

/**
 * Pre-seeded sensible default file pattern exclusions.
 */
export const DEFAULT_EXCLUDED_FILES: ExclusionItem[] = [
  { id: 'eff-1', path: '*-thumbnail.jpg', isPreSeeded: true, note: 'Added automatically — recommended', category: 'file' },
  { id: 'eff-2', path: 'invoice-*.pdf', isPreSeeded: true, note: 'Added automatically — recommended', category: 'file' },
  { id: 'eff-3', path: '.htaccess', isPreSeeded: true, note: 'Added automatically — recommended', category: 'file' },
  { id: 'eff-4', path: 'web.config', isPreSeeded: true, note: 'Added automatically — recommended', category: 'file' }
];

/**
 * Normalizes file/folder paths for matching:
 * - Unifies backslashes (\) to forward slashes (/)
 * - Resolves dot segments (./ and ../)
 * - Collapses redundant slashes (// -> /)
 * - Preserves trailing slashes for directory paths
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath) return '';
  let normalized = inputPath.replace(/\\/g, '/').trim();
  
  const isAbsolute = normalized.startsWith('/');
  const hasTrailingSlash = normalized.endsWith('/');

  const parts = normalized.split('/').filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (resolved.length > 0) resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  let result = (isAbsolute ? '/' : '') + resolved.join('/');
  if (hasTrailingSlash && result !== '/' && !result.endsWith('/')) {
    result += '/';
  }

  return result;
}

/**
 * Matches wildcard patterns (e.g. *-thumbnail.jpg, invoice-*.pdf, *.log).
 * Case-insensitive matching by default.
 */
export function matchWildcardPattern(target: string, pattern: string, caseInsensitive = true): boolean {
  if (!target || !pattern) return false;

  const str = caseInsensitive ? target.toLowerCase() : target;
  const pat = caseInsensitive ? pattern.toLowerCase() : pattern;

  if (str === pat) return true;

  // Convert pattern to regex
  const regexString = '^' + pat
    .replace(/([.+^${}()|[\]\\])/g, '\\$1')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';

  try {
    const regex = new RegExp(regexString);
    return regex.test(str);
  } catch {
    return str.includes(pat);
  }
}

export interface ExclusionResult {
  isExcluded: boolean;
  reason?: string;
  isHardProtected?: boolean;
  matchingRule?: string;
}

/**
 * Core System Boundaries (Always-Protected Paths - Cannot be bypassed or removed via UI)
 */
export const ALWAYS_PROTECTED_REASONS = [
  {
    title: 'Outside /wp-content/uploads/',
    description: 'Core WordPress directories (/wp-admin/, /wp-includes/, /wp-content/plugins/, /wp-content/themes/, /wp-content/mu-plugins/, wp-config.php, .htaccess) are hard-blocked from scanning or deletion.',
    rule: 'System Boundary Enforcer'
  },
  {
    title: 'Appearance > Site Icon & Custom Logo',
    description: 'Files designated as site_icon, cropped-site-icon, custom_logo, or site branding are hard-blocked at the code level.',
    rule: 'WordPress Core Option (site_icon / custom_logo)'
  },
  {
    title: 'Header Image & Custom Background',
    description: 'Theme background images and custom header images set in Theme Customizer are permanently protected.',
    rule: 'WordPress Core Theme Mod'
  },
  {
    title: 'Active Theme Assets',
    description: 'Files in active theme folders or symlinked theme assets are unconditionally protected.',
    rule: 'Active Theme Protection'
  }
];

/**
 * Evaluates whether a given file path, filename, or URL is excluded from scanning/deletion.
 */
export function checkFileExclusion(
  filePathOrUrl: string,
  excludedFolders: (string | ExclusionItem)[] = DEFAULT_EXCLUDED_FOLDERS,
  excludedFiles: (string | ExclusionItem)[] = DEFAULT_EXCLUDED_FILES,
  options?: {
    isOutsideUploads?: boolean;
    isThemeAsset?: boolean;
    isSystemLogoOrIcon?: boolean;
  }
): ExclusionResult {
  if (!filePathOrUrl) {
    return { isExcluded: false };
  }

  const normalized = normalizePath(filePathOrUrl);
  const lowerPath = normalized.toLowerCase();
  const filename = filePathOrUrl.split('/').pop() || filePathOrUrl;
  const lowerFilename = filename.toLowerCase();

  // -----------------------------------------------------------------
  // 1. ALWAYS-PROTECTED PATHS (Hard-Enforced Code Protection)
  // -----------------------------------------------------------------

  // Explicit flag check
  if (options?.isOutsideUploads) {
    return {
      isExcluded: true,
      isHardProtected: true,
      reason: 'Hard-Protected: File is outside /wp-content/uploads/',
      matchingRule: 'System Boundary Enforcer'
    };
  }

  if (options?.isThemeAsset) {
    return {
      isExcluded: true,
      isHardProtected: true,
      reason: 'Hard-Protected: Active Theme asset',
      matchingRule: 'Active Theme Protection'
    };
  }

  if (options?.isSystemLogoOrIcon) {
    return {
      isExcluded: true,
      isHardProtected: true,
      reason: 'Hard-Protected: Core WordPress Site Icon / Custom Logo / Header Image',
      matchingRule: 'WordPress Core Theme Mod'
    };
  }

  // Path inspection check for non-uploads directories
  if (
    lowerPath.includes('/wp-content/plugins/') ||
    lowerPath.includes('/wp-content/themes/') ||
    lowerPath.includes('/wp-content/mu-plugins/') ||
    lowerPath.includes('/wp-includes/') ||
    lowerPath.includes('/wp-admin/') ||
    lowerFilename === 'wp-config.php' ||
    lowerFilename === '.htaccess' ||
    lowerFilename === 'web.config'
  ) {
    return {
      isExcluded: true,
      isHardProtected: true,
      reason: 'Hard-Protected: WordPress core, theme, or plugin path outside uploads.',
      matchingRule: 'System Boundary Enforcer'
    };
  }

  // System theme mod inspection
  if (
    lowerPath.includes('site_icon') ||
    lowerPath.includes('cropped-site-icon') ||
    lowerPath.includes('custom_logo') ||
    lowerPath.includes('header_image') ||
    lowerFilename.startsWith('site-icon') ||
    lowerFilename.startsWith('custom-logo')
  ) {
    return {
      isExcluded: true,
      isHardProtected: true,
      reason: 'Hard-Protected: Site Icon or Custom Logo theme setting.',
      matchingRule: 'WordPress Core Theme Mod'
    };
  }

  // ImgSentry Backup Folder Isolation (Never scan or expose in Media Library)
  if (
    lowerPath.includes('imgsentrybackups') ||
    lowerPath.includes('imgsentry-trash') ||
    lowerFilename.includes('-imgsentry-backup')
  ) {
    return {
      isExcluded: true,
      isHardProtected: true,
      reason: 'Hard-Protected: Plugin Backup Storage (wp-content/uploads/ImgsentryBackups/backups/). Excluded from scanner to protect site performance.',
      matchingRule: 'Plugin Backup Folder Isolation Enforcer'
    };
  }

  // -----------------------------------------------------------------
  // 2. USER FOLDER EXCLUSIONS (Recursive Path Prefix Matching)
  // -----------------------------------------------------------------
  for (const item of excludedFolders) {
    const rawPath = typeof item === 'string' ? item : item?.path;
    if (!rawPath) continue;

    const normFolder = normalizePath(rawPath);
    const lowerFolder = normFolder.toLowerCase();

    // Check recursive path prefix match
    if (
      lowerFolder &&
      (lowerPath.startsWith(lowerFolder) || lowerPath.includes(lowerFolder))
    ) {
      return {
        isExcluded: true,
        isHardProtected: false,
        reason: `Excluded by folder path: ${rawPath}`,
        matchingRule: rawPath
      };
    }
  }

  // -----------------------------------------------------------------
  // 3. USER FILE EXCLUSIONS (Wildcard & Exact Matching)
  // -----------------------------------------------------------------
  for (const item of excludedFiles) {
    const rawPattern = typeof item === 'string' ? item : item?.path;
    if (!rawPattern) continue;

    const normPattern = normalizePath(rawPattern);

    if (
      matchWildcardPattern(filename, rawPattern, true) ||
      matchWildcardPattern(normalized, normPattern, true) ||
      matchWildcardPattern(lowerPath, normPattern.toLowerCase(), true)
    ) {
      return {
        isExcluded: true,
        isHardProtected: false,
        reason: `Excluded by file pattern: ${rawPattern}`,
        matchingRule: rawPattern
      };
    }
  }

  return { isExcluded: false };
}
