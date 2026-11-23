import { PLACEHOLDER_IMAGE_URL } from './placeholderImage';
import { MediaItem } from '../types';

const IMAGE_UNSPLASH_IDS = [
  'photo-1506744038136-46273834b3fb',
  'photo-1586023492125-27b2c045efd7',
  'photo-1618005182384-a83a8bd57fbe',
  'photo-1477959858617-67f30ac4ce78',
  'photo-1545241047-6083a3684587',
  'photo-1579546929518-9e396f3cc809',
  'photo-1505740420928-5e560c06d30e',
  'photo-1518770660439-4636190af475',
  'photo-1498050108023-c5249f4df085',
  'photo-1497215728101-856f4ea42174'
];

const PARENT_ITEMS = [
  { title: 'Homepage Banner', type: 'Page' },
  { title: 'About Us Team Section', type: 'Page' },
  { title: 'Contact Us', type: 'Page' },
  { title: 'Services Overview', type: 'Page' },
  { title: 'Top 10 Security Tips', type: 'Post' },
  { title: 'Wireless Noise-Cancelling Headphones', type: 'WooCommerce' },
  { title: 'Header Theme Settings', type: 'Theme' },
  { title: 'Footer Widget Area', type: 'Widget' },
  { title: 'Consulting Landing Page', type: 'Elementor' },
  { title: 'WooCommerce Catalog', type: 'WooCommerce' },
  { title: 'Checkout Page', type: 'Page' },
  { title: 'Careers Page Header', type: 'Page' }
];

const dates = [
  'May 24, 2024 10:15 AM', 'May 24, 2024 09:30 AM', 'May 23, 2024 04:20 PM',
  'May 22, 2024 11:10 AM', 'May 20, 2024 02:45 PM', 'May 18, 2024 08:00 AM'
];

function generateMediaItems(): MediaItem[] {
  const items: MediaItem[] = [];
  let idCounter = 1;

  // 1. 220 Used Images
  for (let i = 1; i <= 220; i++) {
    const realNames = ['1238250.jpg', '2169305.jpg', 'hrnrl6nfggc.jpg'];
    const realDims = ['1920 x 1080', '2048 x 1536', '1200 x 800'];
    const ext = i <= 3 ? 'jpg' : (i % 8 === 0 ? 'avif' : i % 3 === 0 ? 'png' : i % 5 === 0 ? 'webp' : 'jpg');
    const unsplashId = IMAGE_UNSPLASH_IDS[(i - 1) % IMAGE_UNSPLASH_IDS.length];
    const baseTitle = i <= 3 ? realNames[i - 1].replace('.jpg', '') : `used-image-photo-${i}`;
    const filename = i <= 3 ? realNames[i - 1] : `${baseTitle}.${ext}`;
    const dimensions = i <= 3 ? realDims[i - 1] : (i % 2 === 0 ? '1920 x 1080' : '1200 x 800');

    const primary = PARENT_ITEMS[(i - 1) % PARENT_ITEMS.length];
    const secondary = PARENT_ITEMS[(i * 3 + 1) % PARENT_ITEMS.length];
    const locationCount = (i % 3) + 1; // 1, 2, or 3 locations

    const reasons: string[] = [
      `${primary.title} [${primary.type}]`
    ];
    if (locationCount >= 2 && secondary.title !== primary.title) {
      reasons.push(`${secondary.title} [${secondary.type}]`);
    }
    if (locationCount >= 3) {
      const tertiary = PARENT_ITEMS[(i * 5 + 2) % PARENT_ITEMS.length];
      if (tertiary.title !== primary.title && tertiary.title !== secondary.title) {
        reasons.push(`${tertiary.title} [${tertiary.type}]`);
      }
    }

    items.push({
      id: idCounter++,
      title: filename,
      filename: filename,
      url: PLACEHOLDER_IMAGE_URL,
      thumbUrl: PLACEHOLDER_IMAGE_URL,
      mimeType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'avif' ? 'image/avif' : 'image/jpeg',
      category: 'images',
      extension: ext,
      fileSize: 450000 + (i * 1234) % 1200000,
      formattedSize: `${((450000 + (i * 1234) % 1200000) / (1024 * 1024)).toFixed(2)} MB`,
      uploadDate: dates[i % dates.length],
      dimensions: dimensions,
      location: 'Uploads',
      isAttached: true,
      parentTitle: primary.title,
      parentType: primary.type,
      extraUsageCount: reasons.length - 1,
      inUse: true,
      useReasons: reasons,
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 1b. 100 New Beauty Images (Used)
  const BEAUTY_KEYWORDS = ['beauty', 'fashion', 'skincare', 'makeup', 'wellness', 'model', 'portrait', 'aesthetic'];
  for (let i = 1; i <= 100; i++) {
    const keyword = BEAUTY_KEYWORDS[i % BEAUTY_KEYWORDS.length];
    const ext = 'jpg';
    const baseTitle = `beauty-item-${i}`;
                    const imageUrl = PLACEHOLDER_IMAGE_URL;
    const thumbUrl = PLACEHOLDER_IMAGE_URL;
    
    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: imageUrl,
      thumbUrl: thumbUrl,
      mimeType: 'image/jpeg',
      category: 'images',
      extension: ext,
      fileSize: 200000 + (i * 5678) % 800000,
      formattedSize: `${((200000 + (i * 5678) % 800000) / (1024 * 1024)).toFixed(2)} MB`,
      uploadDate: 'May 24, 2024 11:20 AM',
      dimensions: '1200 x 1600',
      location: 'Uploads',
      isAttached: true,
      parentTitle: 'Beauty Collection Page',
      parentType: 'Page',
      extraUsageCount: (i % 2),
      inUse: true,
      useReasons: ['Beauty Collection Page [Page]', 'Used in gallery'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 2. 150 Unused Images
  for (let i = 1; i <= 150; i++) {
    const ext = i % 7 === 0 ? 'avif' : i % 2 === 0 ? 'png' : 'jpg';
    const unsplashId = IMAGE_UNSPLASH_IDS[(i - 1) % IMAGE_UNSPLASH_IDS.length];
    const baseTitle = `unused-media-gallery-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: PLACEHOLDER_IMAGE_URL,
      thumbUrl: PLACEHOLDER_IMAGE_URL,
      mimeType: ext === 'png' ? 'image/png' : ext === 'avif' ? 'image/avif' : 'image/jpeg',
      category: 'images',
      extension: ext,
      fileSize: 300000 + (i * 987) % 900000,
      formattedSize: `${((300000 + (i * 987) % 900000) / 1024).toFixed(1)} KB`,
      uploadDate: dates[i % dates.length],
      dimensions: '1200 x 800',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 3. 30 Videos
  for (let i = 1; i <= 30; i++) {
    const ext = i % 2 === 0 ? 'mp4' : 'webm';
    const baseTitle = `product-demo-video-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: '#',
      mimeType: ext === 'mp4' ? 'video/mp4' : 'video/webm',
      category: 'video',
      extension: ext,
      fileSize: 12000000 + (i * 54321),
      formattedSize: `${((12000000 + (i * 54321)) / (1024 * 1024)).toFixed(1)} MB`,
      uploadDate: dates[i % dates.length],
      dimensions: '1920 x 1080',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 4. 25 SVG
  for (let i = 1; i <= 25; i++) {
    const baseTitle = `vector-icon-graphic-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.svg`,
      filename: `${baseTitle}.svg`,
      url: '#',
      mimeType: 'image/svg+xml',
      category: 'images',
      extension: 'svg',
      fileSize: 15000 + (i * 450),
      formattedSize: `${((15000 + (i * 450)) / 1024).toFixed(1)} KB`,
      uploadDate: dates[i % dates.length],
      dimensions: '512 x 512',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 5. 25 ZIP, TAR (Archives / Other)
  for (let i = 1; i <= 25; i++) {
    const ext = i % 2 === 0 ? 'zip' : 'tar';
    const baseTitle = `backup-archive-bundle-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: '#',
      mimeType: ext === 'zip' ? 'application/zip' : 'application/x-tar',
      category: 'other',
      extension: ext,
      fileSize: 8500000 + (i * 88888),
      formattedSize: `${((8500000 + (i * 88888)) / (1024 * 1024)).toFixed(1)} MB`,
      uploadDate: dates[i % dates.length],
      dimensions: '—',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 6. 25 WAV (Audio)
  for (let i = 1; i <= 25; i++) {
    const baseTitle = `audio-recording-track-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.wav`,
      filename: `${baseTitle}.wav`,
      url: '#',
      mimeType: 'audio/wav',
      category: 'audio',
      extension: 'wav',
      fileSize: 5200000 + (i * 12345),
      formattedSize: `${((5200000 + (i * 12345)) / (1024 * 1024)).toFixed(1)} MB`,
      uploadDate: dates[i % dates.length],
      dimensions: '—',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 7. 25 TTF Font
  for (let i = 1; i <= 25; i++) {
    const baseTitle = `custom-typography-font-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.ttf`,
      filename: `${baseTitle}.ttf`,
      url: '#',
      mimeType: 'font/ttf',
      category: 'fonts',
      extension: 'ttf',
      fileSize: 65000 + (i * 1200),
      formattedSize: `${((65000 + (i * 1200)) / 1024).toFixed(1)} KB`,
      uploadDate: dates[i % dates.length],
      dimensions: '—',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 8. 25 XLS Files
  for (let i = 1; i <= 25; i++) {
    const baseTitle = `financial-spreadsheet-data-${i}`;
    items.push({
      id: idCounter++,
      title: `${baseTitle}.xls`,
      filename: `${baseTitle}.xls`,
      url: '#',
      mimeType: 'application/vnd.ms-excel',
      category: 'documents',
      extension: 'xls',
      fileSize: 180000 + (i * 3400),
      formattedSize: `${((180000 + (i * 3400)) / 1024).toFixed(1)} KB`,
      uploadDate: dates[i % dates.length],
      dimensions: '—',
      location: 'Uploads',
      isAttached: false,
      inUse: false,
      useReasons: ['Not used anywhere - File is not referenced in posts, pages or widgets'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 9. 120 Items in various locations (Themes, Plugins, Cache, Backups, Custom, Others)
  const locations = ['Themes', 'Plugins', 'Cache', 'Backups', 'Custom Folders', 'Others'];
  for (let i = 1; i <= 120; i++) {
    const loc = locations[i % locations.length];
    const isImage = i % 2 === 0;
    const category = isImage ? 'images' : 'documents';
    const ext = isImage ? 'jpg' : 'pdf';
    const baseTitle = `location-test-item-${loc.toLowerCase().replace(' ', '-')}-${i}`;
    const isUsed = i % 5 !== 0; // 4 out of 5 are used (80%)
    
    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: isImage ? PLACEHOLDER_IMAGE_URL : '#',
      thumbUrl: isImage ? PLACEHOLDER_IMAGE_URL : undefined,
      mimeType: isImage ? 'image/jpeg' : 'application/pdf',
      category: category,
      extension: ext,
      fileSize: (isImage ? 250000 : 1200000) + (i * 4321) % 500000,
      formattedSize: isImage 
        ? `${(((250000 + (i * 4321) % 500000)) / 1024).toFixed(1)} KB`
        : `${(((1200000 + (i * 4321) % 500000)) / (1024 * 1024)).toFixed(2)} MB`,
      uploadDate: dates[i % dates.length],
      dimensions: isImage ? '1200 x 800' : '—',
      location: loc as any,
      isAttached: isUsed,
      parentTitle: isUsed ? `${loc} Assets` : undefined,
      parentType: isUsed ? (loc === 'Themes' ? 'Theme' : 'Plugin') : undefined,
      inUse: isUsed,
      useReasons: isUsed ? [`Internal ${loc} asset`, 'Referenced by code'] : ['Not used anywhere'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 10. 250 New Category Images (Girls, Construction, Food, Fashion)
  // 125 Unique images, each duplicated once = 250 total.
  // 150 used, 100 unused.
  const CATEGORIES = ['Girls', 'Construction', 'Food', 'Fashion'];
  const CATEGORY_TAGS = ['portrait', 'building', 'cuisine', 'style'];
  
  for (let u = 1; u <= 125; u++) {
    const categoryIndex = (u - 1) % 4;
    const category = CATEGORIES[categoryIndex];
    const tag = CATEGORY_TAGS[categoryIndex];
    const uniqueId = `cat-unique-${u}`;
    
    // We create 2 instances of each unique image
    for (let c = 1; c <= 2; c++) {
      const isUsed = u <= 75; // First 75 unique images are used (75 * 2 = 150 files)
      const filename = c === 1 ? `${category.toLowerCase()}-image-${u}.jpg` : `${category.toLowerCase()}-image-${u} (1).jpg`;
      const useCount = isUsed ? (u % 3) + 1 : 0;
      
      items.push({
        id: idCounter++,
        title: filename,
        filename: filename,
        // Using same seed for both copies to simulate "duplicate" content
        url: PLACEHOLDER_IMAGE_URL,
        thumbUrl: PLACEHOLDER_IMAGE_URL,
        mimeType: 'image/jpeg',
        category: 'images',
        extension: 'jpg',
        fileSize: 150000 + (u * 1234) % 400000,
        formattedSize: `${((150000 + (u * 1234) % 400000) / 1024).toFixed(1)} KB`,
        uploadDate: 'July 30, 2026 10:00 AM',
        dimensions: '800 x 1000',
        location: 'Uploads',
        isAttached: isUsed,
        parentTitle: isUsed ? `${category} Review Post` : undefined,
        parentType: isUsed ? 'Post' : undefined,
        extraUsageCount: isUsed ? useCount - 1 : 0,
        inUse: isUsed,
        useReasons: isUsed 
          ? [`${category} Review Post [Post]`, `Used in ${useCount} places`] 
          : ['Not used anywhere'],
        isTrashed: false,
        daysInTrash: 0
      });
    }
  }

  // 11. 50 NEW Used Media (Video/Audio) and Other Files
  const mediaExtensions = ['mp4', 'webm', 'wav', 'mp3'];
  const otherExtensions = ['zip', 'tar', 'gz', 'json', 'xml'];
  const mediaLocations = ['Themes', 'Plugins', 'Backups', 'Custom Folders', 'Uploads'];

  for (let i = 1; i <= 50; i++) {
    const isMedia = i <= 25;
    const ext = isMedia 
      ? mediaExtensions[i % mediaExtensions.length] 
      : otherExtensions[i % otherExtensions.length];
    
    const category = isMedia 
      ? (['mp4', 'webm'].includes(ext) ? 'video' : 'audio')
      : 'other';
    
    const baseTitle = isMedia 
      ? `new-used-media-file-${i}` 
      : `new-used-system-file-${i}`;
    
    const loc = mediaLocations[i % mediaLocations.length];

    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: '#',
      mimeType: isMedia 
        ? (ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg')
        : (ext === 'zip' ? 'application/zip' : 'application/octet-stream'),
      category: category as any,
      extension: ext,
      fileSize: isMedia ? (15000000 + i * 100000) : (5000000 + i * 50000),
      formattedSize: isMedia 
        ? `${((15000000 + i * 100000) / (1024 * 1024)).toFixed(1)} MB`
        : `${((5000000 + i * 50000) / (1024 * 1024)).toFixed(1)} MB`,
      uploadDate: 'July 31, 2026 11:30 AM',
      dimensions: '—',
      location: loc as any,
      isAttached: true,
      parentTitle: `${loc} Feature Asset`,
      parentType: (loc === 'Themes' || loc === 'Plugins') ? (loc.slice(0, -1) as any) : 'Page',
      inUse: true,
      useReasons: [`Used in ${loc} functional component`, 'Active site dependency'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 12. 100 ADDITIONAL NEW Used Media and Other Files (50 each)
  const additionalLocations = ['Marketing', 'Legal', 'HR', 'IT Support', 'External Storage'];
  for (let i = 1; i <= 100; i++) {
    const isMedia = i <= 50;
    const ext = isMedia 
      ? ['mp4', 'mp3', 'wav', 'mov'][i % 4] 
      : ['zip', 'pdf', 'docx', 'xlsx'][i % 4];
    
    const category = isMedia 
      ? (['mp4', 'mov'].includes(ext) ? 'video' : 'audio')
      : (ext === 'pdf' ? 'documents' : 'other');
    
    const baseTitle = isMedia 
      ? `batch2-media-asset-${i}` 
      : `batch2-system-doc-${i}`;
    
    const loc = additionalLocations[i % additionalLocations.length];

    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: '#',
      mimeType: isMedia 
        ? (ext === 'mp4' ? 'video/mp4' : ext === 'mov' ? 'video/quicktime' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg')
        : (ext === 'zip' ? 'application/zip' : ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
      category: category as any,
      extension: ext,
      fileSize: isMedia ? (20000000 + i * 200000) : (1000000 + i * 100000),
      formattedSize: isMedia 
        ? `${((20000000 + i * 200000) / (1024 * 1024)).toFixed(1)} MB`
        : `${((1000000 + i * 100000) / (1024 * 1024)).toFixed(1)} MB`,
      uploadDate: 'July 31, 2026 01:30 PM',
      dimensions: '—',
      location: loc as any,
      isAttached: true,
      parentTitle: `${loc} Department Resource`,
      parentType: 'Page',
      inUse: true,
      useReasons: [`Used in ${loc} portal`, 'Mandatory resource'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 13. 50 FINAL ADDITIONAL Used Media and Other Files (in Uploads)
  for (let i = 1; i <= 50; i++) {
    const isMedia = i <= 25;
    const ext = isMedia ? (i % 2 === 0 ? 'mp4' : 'mp3') : (i % 2 === 0 ? 'zip' : 'pdf');
    const category = isMedia ? (ext === 'mp4' ? 'video' : 'audio') : (ext === 'pdf' ? 'documents' : 'other');
    const baseTitle = isMedia ? `final-used-media-${i}` : `final-used-file-${i}`;
    
    items.push({
      id: idCounter++,
      title: `${baseTitle}.${ext}`,
      filename: `${baseTitle}.${ext}`,
      url: '#',
      mimeType: isMedia ? (ext === 'mp4' ? 'video/mp4' : 'audio/mpeg') : (ext === 'zip' ? 'application/zip' : 'application/pdf'),
      category: category as any,
      extension: ext,
      fileSize: isMedia ? 25000000 : 2000000,
      formattedSize: isMedia ? '23.8 MB' : '1.9 MB',
      uploadDate: 'July 31, 2026 02:30 PM',
      dimensions: '—',
      location: 'Uploads',
      isAttached: true,
      parentTitle: 'Main Site Asset',
      parentType: 'Page',
      inUse: true,
      useReasons: ['Essential site resource', 'Used in header/footer'],
      isTrashed: false,
      daysInTrash: 0
    });
  }

  // 14. SPECIFIC ADDITION: 5 Videos, 5 Audios, 2 Zip Files (Used)
  const specificAdditions = [
    // 5 Videos
    ...Array.from({ length: 5 }, (_, i) => ({
      title: `User-Video-${i + 1}.mp4`,
      ext: 'mp4',
      cat: 'video',
      mime: 'video/mp4',
      size: 45000000 + i * 1000000
    })),
    // 5 Audios
    ...Array.from({ length: 5 }, (_, i) => ({
      title: `User-Audio-${i + 1}.mp3`,
      ext: 'mp3',
      cat: 'audio',
      mime: 'audio/mpeg',
      size: 8000000 + i * 500000
    })),
    // 2 Zip Files
    ...Array.from({ length: 2 }, (_, i) => ({
      title: `User-Archive-${i + 1}.zip`,
      ext: 'zip',
      cat: 'other',
      mime: 'application/zip',
      size: 12000000 + i * 2000000
    })),
    // Missing Formats: GIF, DOC, PPT, OGG, AVI, AVIF
    {
      title: 'User-Animation-1.gif',
      ext: 'gif',
      cat: 'images',
      mime: 'image/gif',
      size: 512000
    },
    {
      title: 'Client-Contract-2026.doc',
      ext: 'doc',
      cat: 'documents',
      mime: 'application/msword',
      size: 1250000
    },
    {
      title: 'Marketing-Presentation.ppt',
      ext: 'ppt',
      cat: 'documents',
      mime: 'application/vnd.ms-powerpoint',
      size: 4710000
    },
    {
      title: 'System-Chime-Audio.ogg',
      ext: 'ogg',
      cat: 'audio',
      mime: 'audio/ogg',
      size: 153000
    },
    {
      title: 'Archived-Footage.avi',
      ext: 'avi',
      cat: 'video',
      mime: 'video/x-msvideo',
      size: 54500000
    },
    {
      title: 'Hero-Banner-Optimized.avif',
      ext: 'avif',
      cat: 'images',
      mime: 'image/avif',
      size: 87000
    }
  ];

  specificAdditions.forEach(data => {
    const isVideo = data.cat === 'video' || ['mp4', 'webm', 'mov', 'avi'].includes(data.ext);
    const isAudio = data.cat === 'audio' || ['mp3', 'wav', 'ogg'].includes(data.ext);
    const isImage = data.cat === 'images' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(data.ext);

    let dims = '—';
    if (isVideo) dims = '1920 x 1080';
    else if (isImage) dims = '1200 x 800';

    const calcFormattedSize = data.size >= 1024 * 1024 
      ? `${(data.size / (1024 * 1024)).toFixed(1)} MB` 
      : `${(data.size / 1024).toFixed(1)} KB`;

    items.push({
      id: idCounter++,
      title: data.title,
      filename: data.title,
      url: '#',
      mimeType: data.mime,
      category: data.cat as any,
      extension: data.ext,
      fileSize: data.size,
      formattedSize: calcFormattedSize,
      uploadDate: 'July 31, 2026 01:48 PM',
      dimensions: dims,
      location: 'Uploads',
      isAttached: true,
      parentTitle: 'User Uploaded Resource',
      parentType: 'Page',
      inUse: true,
      useReasons: ['User uploaded asset', 'Active site content'],
      isTrashed: false,
      daysInTrash: 0
    });
  });

  // Enrich images with thumbnail sub-sizes, backups, and nextgen companion formats
  items.forEach((it, idx) => {
    if (it.category === 'images' && !it.fileMissing) {
      it.thumbnailSizesBytes = Math.round(it.fileSize * 0.35);
      it.subSizesCount = 4;
      if (idx % 15 === 0) {
        it.backupCreated = true;
        it.backupSizeBytes = Math.round(it.fileSize * 1.35);
      }
      if (idx % 10 === 0) {
        const ngSize = Math.round(it.fileSize * 0.62);
        it.nextGenFormats = {
          webp: true,
          siblingSizeBytes: ngSize,
          siblingFormat: 'webp'
        };
        it.nextgenSizesBytes = ngSize;
      }
    }
  });

  // Ghost file records (manually deleted via FTP, attachment post exists)
  // Per requirement 4: fileMissing: true, fileSize: 0 (phantom size excluded completely)
  items.push({
    id: idCounter++,
    title: 'ghost-hero-banner.jpg',
    filename: 'ghost-hero-banner.jpg',
    url: '#',
    thumbUrl: '',
    mimeType: 'image/jpeg',
    category: 'images',
    extension: 'jpg',
    fileSize: 0,
    formattedSize: 'Missing on disk',
    uploadDate: 'Jan 10, 2024 09:15 AM',
    dimensions: '1920 x 1080',
    location: 'Uploads',
    isAttached: true,
    parentTitle: 'Landing Page',
    inUse: false,
    useReasons: ['File missing on disk (deleted via FTP/SSH)'],
    isTrashed: false,
    daysInTrash: 0,
    fileMissing: true,
    file_missing: true,
    thumbnailSizesBytes: 0,
    subSizesCount: 0
  });

  return items;
}

// Sample data for the standalone dev preview only. Vite replaces import.meta.env.DEV with false in the production build, so this data is not shipped inside the plugin.
export const INITIAL_MOCK_MEDIA: MediaItem[] = import.meta.env.DEV ? generateMediaItems() : [];
