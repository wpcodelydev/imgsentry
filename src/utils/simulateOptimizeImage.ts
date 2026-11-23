import { MediaItem } from '../types';

export interface OptimizationOptions {
  compressionLevel: 'lossless' | 'balanced' | 'aggressive' | 'custom';
  customQuality?: number;
  maxWidth: number;
  maxHeight: number;
  resizeLargeImages?: boolean;
  keepExif: boolean;
  preserveTransparency: boolean;
  outputFormat: 'original' | 'webp' | 'avif';
  generateBackup: boolean;
}

export interface OptimizationResult {
  success: boolean;
  attachmentId: number;
  originalSizeBytes: number;
  optimizedSizeBytes?: number;
  primarySizeBytes?: number;
  nextGenSiblingSizeBytes?: number;
  nextGenFormats?: {
    webp?: boolean;
    avif?: boolean;
    siblingSizeBytes?: number;
    siblingSizeKB?: number;
    siblingFormat?: string;
  };
  newFormat?: string;
  newDimensions?: string;
  bytesSaved?: number;
  percentSaved?: number;
  errorReason?: string;
  backupCreated: boolean;
}

export interface CachedEstimate {
  settingsHash: string;
  optimizedSizeBytes: number;
  bytesSaved: number;
  newDimensions: string;
  newFormat: string;
}

export function getSettingsHash(options: OptimizationOptions): string {
  const w = (options.maxWidth != null && !isNaN(Number(options.maxWidth))) ? Number(options.maxWidth) : 0;
  const h = (options.maxHeight != null && !isNaN(Number(options.maxHeight))) ? Number(options.maxHeight) : 0;
  return [
    options.compressionLevel,
    options.customQuality ?? 80,
    w,
    h,
    options.resizeLargeImages ? 1 : 0,
    options.keepExif ? 1 : 0,
    options.preserveTransparency ? 1 : 0,
    options.generateBackup ? 1 : 0,
    options.outputFormat
  ].join('|');
}

export interface TargetImageForCalc {
  id: number;
  filename: string;
  fileSize: number; // in bytes
  extension?: string;
  dimensions?: string;
}

// Project-level mock flag for AVIF support capability check
export const MOCK_SERVER_SUPPORTS_AVIF = true;

// Realistic average compression ratios per format/level for lossy compression
export const COMPRESSION_RATIOS = {
  original: {
    balanced: 0.475,    // ~52.5% reduction (JPG staying JPG)
    aggressive: 0.285,  // ~71.5% reduction
  },
  webp: {
    balanced: 0.425,    // ~57.5% reduction (JPG -> WebP)
    aggressive: 0.26,   // ~74% reduction
  },
  avif: {
    balanced: 0.30,     // ~70% reduction (JPG -> AVIF)
    aggressive: 0.16,   // ~84% reduction
  }
};

/**
 * Simple seeded pseudo-random number generator to ensure identical estimate 
 * and actual results for a given image item.
 */
export function getSeededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export interface CalculatedOptimizationSize {
  optimizedSizeBytes: number; // Primary compressed size (e.g. JPG in-place)
  primarySizeBytes: number;    // Same as optimizedSizeBytes
  nextGenSiblingSizeBytes?: number; // Deeper Next-Gen (WebP/AVIF) sibling size
  newFormat: string;          // Primary format (e.g. 'jpg', 'png')
  newDimensions: string;
  bytesSaved: number;         // Primary bytes saved
  percentSaved: number;       // Primary percent saved
  nextGenBytesSaved?: number; // Sibling bytes saved
  nextGenPercentSaved?: number; // Sibling percent saved
}

/**
 * Shared, 100% deterministic calculation function used for estimating 
 * optimization (estimate only, not real optimization).
 * 
 * Separates Step 1 Primary File In-Place Compression from Step 2 Next-Gen Sibling Generation.
 */
export function calculateOptimizedSize(
  item: TargetImageForCalc,
  options: OptimizationOptions
): CalculatedOptimizationSize {
  const originalSizeBytes = item.fileSize || 0;
  const seed = item.id || 1;
  const seededRandom1 = getSeededRandom(seed);
  const seededRandom2 = getSeededRandom(seed + 100);

  const currentExt = (item.extension || item.filename?.split('.').pop() || 'jpg').toLowerCase();
  
  // Primary file always retains its original format (e.g. 'jpg', 'png')
  const newFormat = currentExt;

  // Format-aware Balanced ratio helper matching calibrated savings ranges
  const getBalancedRatio = (ext: string, fmt: string): number => {
    const isAVIF = fmt === 'avif';
    const isWebP = fmt === 'webp';

    if (isAVIF) {
      // Converting to AVIF adds ~12.5% savings on top of WebP equivalent
      return ext === 'png' ? 0.20 : 0.30; // 80% or 70% savings
    }
    if (isWebP) {
      if (ext === 'png') return 0.325; // 67.5% savings (range 60-75%)
      if (ext === 'jpg' || ext === 'jpeg') return 0.425; // 57.5% savings (range 50-65%)
      return 0.45;
    }
    // Staying original / same format
    if (ext === 'png') return 0.40; // 60% savings (range 50-70%)
    if (ext === 'jpg' || ext === 'jpeg') return 0.475; // 52.5% savings (range 45-60%)
    return 0.50;
  };

  // Format-aware Aggressive ratio helper matching calibrated savings ranges
  const getAggressiveRatio = (ext: string, fmt: string): number => {
    const isAVIF = fmt === 'avif';
    const isWebP = fmt === 'webp';

    if (isAVIF) {
      // Converting to AVIF adds ~10% savings on top of WebP equivalent
      return ext === 'png' ? 0.10 : 0.16; // 90% or 84% savings
    }
    if (isWebP) {
      if (ext === 'png') return 0.20; // 80% savings (range 75-85%)
      if (ext === 'jpg' || ext === 'jpeg') return 0.26; // 74% savings (range 68-80%)
      return 0.25;
    }
    // Staying original / same format
    if (ext === 'png') return 0.24; // 76% savings (range 70-82%)
    if (ext === 'jpg' || ext === 'jpeg') return 0.285; // 71.5% savings (range 65-78%)
    return 0.30;
  };

  // Format-aware Lossless base ratio helper for Custom interpolation
  const getLosslessBaseRatio = (ext: string, fmt: string): number => {
    const isConvertingToWebP = fmt === 'webp' && ext !== 'webp';
    const isConvertingToAvif = fmt === 'avif' && ext !== 'avif';

    if (isConvertingToWebP || isConvertingToAvif) {
      return 0.75; // ~25% base savings
    }
    if (ext === 'png') {
      return 0.775; // ~22.5% base savings
    }
    if (ext === 'webp' || ext === 'avif') {
      return 0.925; // ~7.5% base savings
    }
    return 0.90; // ~10% base savings (JPG)
  };

  const computeRatioForFormat = (targetFmt: 'original' | 'webp' | 'avif'): number => {
    let finalRatio: number;

    if (options.compressionLevel === 'lossless') {
      let baseSavingsPercent: number;
      const isConvertingToWebP = targetFmt === 'webp' && currentExt !== 'webp';
      const isConvertingToAvif = targetFmt === 'avif' && currentExt !== 'avif';

      if (isConvertingToWebP || isConvertingToAvif) {
        baseSavingsPercent = 0.25;
      } else if (currentExt === 'png') {
        baseSavingsPercent = 0.225;
      } else if (currentExt === 'webp' || currentExt === 'avif') {
        baseSavingsPercent = 0.075;
      } else {
        baseSavingsPercent = 0.10;
      }

      if (!options.keepExif) {
        if (currentExt === 'jpg' || currentExt === 'jpeg') {
          baseSavingsPercent += 0.04;
        } else if (currentExt === 'png') {
          baseSavingsPercent += 0.02;
        } else {
          baseSavingsPercent += 0.01;
        }
      }

      const supportsTransparency = ['png', 'webp', 'avif'].includes(currentExt);
      if (!options.preserveTransparency && supportsTransparency) {
        baseSavingsPercent += 0.03;
      }

      finalRatio = Math.max(0.65, Math.min(0.95, 1 - baseSavingsPercent));
    } else {
      let ratio: number;
      if (options.compressionLevel === 'balanced') {
        ratio = getBalancedRatio(currentExt, targetFmt);
      } else if (options.compressionLevel === 'aggressive') {
        ratio = getAggressiveRatio(currentExt, targetFmt);
      } else if (options.compressionLevel === 'custom') {
        const q = Math.max(1, Math.min(100, options.customQuality ?? 80));
        const rLossless = getLosslessBaseRatio(currentExt, targetFmt);
        const rBalanced = getBalancedRatio(currentExt, targetFmt);
        const rAggressive = getAggressiveRatio(currentExt, targetFmt);

        if (q >= 80) {
          if (q >= 95) {
            const t = Math.min(1, (q - 95) / 5);
            ratio = rLossless + t * (0.95 - rLossless);
          } else {
            const t = (q - 80) / 15;
            ratio = rBalanced + t * (rLossless - rBalanced);
          }
        } else if (q >= 50) {
          const t = (q - 50) / 30;
          ratio = rAggressive + t * (rBalanced - rAggressive);
        } else {
          const t = (q - 1) / 49;
          const rMin = Math.max(0.10, rAggressive * 0.45);
          ratio = rMin + t * (rAggressive - rMin);
        }
      } else {
        ratio = COMPRESSION_RATIOS[targetFmt]?.[options.compressionLevel] ?? 0.285;
      }

      const randomVariance = 1 + (seededRandom1 * 0.08 - 0.04);
      finalRatio = ratio * randomVariance;

      if (!options.keepExif) {
        const exifBytes = Math.min(Math.floor(originalSizeBytes * 0.04), Math.floor(seededRandom2 * 8000) + 2000);
        finalRatio -= (exifBytes / Math.max(1, originalSizeBytes));
      }

      const supportsTransparency = ['png', 'webp', 'avif'].includes(targetFmt) || ['png', 'webp', 'avif'].includes(currentExt);
      if (!options.preserveTransparency && supportsTransparency) {
        finalRatio *= 0.88;
      }

      if (finalRatio >= 0.98) finalRatio = 0.98;
    }

    return finalRatio;
  };

  // 1. Calculate Primary In-Place Compression Ratio (Step 1)
  let primaryFinalRatio = computeRatioForFormat('original');

  // Calculate dimensions scaling if maxWidth/maxHeight are set
  let origW = 1920;
  let origH = 1080;
  if (item.dimensions) {
    const dimMatch = item.dimensions.match(/(\d+)\s*[\*x×,;]\s*(\d+)/i);
    if (dimMatch) {
      origW = parseInt(dimMatch[1], 10) || 1920;
      origH = parseInt(dimMatch[2], 10) || 1080;
    }
  }

  let newW = origW;
  let newH = origH;
  
  const shouldResize = options.resizeLargeImages ?? false; // default OFF
  
  if (shouldResize) {
    const pWidth = options.maxWidth || 0;
    const pHeight = options.maxHeight || 0;
    if (pWidth > 0 && pHeight > 0) {
      newW = pWidth;
      newH = pHeight;
    } else if (pWidth > 0) {
      newW = pWidth;
      newH = Math.max(1, Math.round(origH * (pWidth / origW)));
    } else if (pHeight > 0) {
      newH = pHeight;
      newW = Math.max(1, Math.round(origW * (pHeight / origH)));
    }
  }

  let newDimensions = item.dimensions || `${origW} x ${origH}`;

  if (newW !== origW || newH !== origH) {
    newDimensions = `${newW} x ${newH}`;
    const dimensionRatio = (newW * newH) / (origW * origH);
    primaryFinalRatio = primaryFinalRatio * Math.max(0.05, dimensionRatio);
  }

  const primarySizeBytes = Math.max(1024, Math.floor(originalSizeBytes * primaryFinalRatio));

  // 2. Calculate Next-Gen Sibling Compression Ratio (Step 2) if requested
  let nextGenSiblingSizeBytes: number | undefined;
  let nextGenBytesSaved: number | undefined;
  let nextGenPercentSaved: number | undefined;

  if (options.outputFormat === 'webp' || options.outputFormat === 'avif') {
    let siblingFinalRatio = computeRatioForFormat(options.outputFormat);
    if (newW !== origW || newH !== origH) {
      const dimensionRatio = (newW * newH) / (origW * origH);
      siblingFinalRatio = siblingFinalRatio * Math.max(0.05, dimensionRatio);
    }
    nextGenSiblingSizeBytes = Math.max(1024, Math.floor(originalSizeBytes * siblingFinalRatio));
    nextGenBytesSaved = Math.max(0, originalSizeBytes - nextGenSiblingSizeBytes);
    nextGenPercentSaved = originalSizeBytes > 0 ? (nextGenBytesSaved / originalSizeBytes) * 100 : 0;
  }

  const effectiveSizeBytes = primarySizeBytes; // size of the main file, the file people download
  const bytesSaved = Math.max(0, originalSizeBytes - effectiveSizeBytes);
  const percentSaved = originalSizeBytes > 0 ? (bytesSaved / originalSizeBytes) * 100 : 0;

  return {
    optimizedSizeBytes: effectiveSizeBytes, // Headline displayed size is the main file
    primarySizeBytes,
    nextGenSiblingSizeBytes,
    newFormat,
    newDimensions,
    bytesSaved,
    percentSaved,
    nextGenBytesSaved,
    nextGenPercentSaved
  };
}

/**
 * Simulates optimizing a WordPress media attachment using realistic 
 * mock data, realistic delays, and realistic occasional failures.
 * Used for pure UI estimates and testing in standalone preview (estimate only, not real optimization).
 * 
 * @param item The source mock MediaItem
 * @param options Optimization settings
 * @returns Promise resolving to an OptimizationResult
 */
export async function simulateOptimizeImage(
  item: MediaItem, 
  options: OptimizationOptions
): Promise<OptimizationResult> {
  // 1. Realistic async delay (300-900ms)
  const delay = Math.floor(Math.random() * 600) + 300;
  await new Promise(resolve => setTimeout(resolve, delay));

  const originalSizeBytes = item.fileSize || 0;
  const backupCreated = options.generateBackup;

  // 2. AVIF Capability check simulation
  if (options.outputFormat === 'avif' && !MOCK_SERVER_SUPPORTS_AVIF) {
    return {
      success: false,
      attachmentId: item.id,
      originalSizeBytes,
      errorReason: 'AVIF output format is not supported on this hosting environment. Requires PHP 8.1+ with GD imageavif() or Imagick with AVIF delegate.',
      backupCreated: false
    };
  }

  // 3. Occasional realistic failure (~4% chance) to exercise UI failure states
  if (Math.random() < 0.04) {
    const errorReasons = [
      'Unsupported color profile or corrupt metadata.',
      'File appears corrupted or truncated (0 bytes).',
      'Imagick failed to write optimized image file to disk.',
      'Disk read/write permission denied for file.'
    ];
    const randomReason = errorReasons[Math.floor(Math.random() * errorReasons.length)];
    return {
      success: false,
      attachmentId: item.id,
      originalSizeBytes,
      errorReason: randomReason,
      backupCreated: false
    };
  }

  // 4. Calculate realistic simulated result
  const origExt = (item.extension || item.filename?.split('.').pop() || 'jpg').toLowerCase();
  const calc = calculateOptimizedSize(
    {
      id: item.id,
      filename: item.filename,
      fileSize: originalSizeBytes,
      dimensions: item.dimensions,
      extension: origExt
    },
    options
  );

  return {
    success: true,
    attachmentId: item.id,
    originalSizeBytes,
    optimizedSizeBytes: calc.primarySizeBytes, // Step 1 Primary compressed size
    primarySizeBytes: calc.primarySizeBytes,
    nextGenSiblingSizeBytes: calc.nextGenSiblingSizeBytes,
    nextGenFormats: (options.outputFormat === 'webp' || options.outputFormat === 'avif') ? {
      webp: options.outputFormat === 'webp',
      avif: options.outputFormat === 'avif',
      siblingSizeBytes: calc.nextGenSiblingSizeBytes,
      siblingSizeKB: calc.nextGenSiblingSizeBytes ? Math.round(calc.nextGenSiblingSizeBytes / 1024) : undefined,
      siblingFormat: options.outputFormat
    } : undefined,
    newFormat: calc.newFormat,
    newDimensions: calc.newDimensions,
    bytesSaved: calc.bytesSaved,
    percentSaved: calc.percentSaved,
    backupCreated
  };
}
