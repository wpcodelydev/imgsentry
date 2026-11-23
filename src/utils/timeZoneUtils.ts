export interface TimeZoneOption {
  value: string; // e.g. "Asia/Dhaka" or "(UTC+06:00) Dhaka, Asia/Dhaka"
  label: string;
  iana: string;
  offset: string;
  region: string;
}

export const INTERNATIONAL_TIMEZONES: TimeZoneOption[] = [
  // UTC / GMT
  { value: "UTC", label: "(UTC+00:00) Universal Coordinated Time (UTC)", iana: "UTC", offset: "+00:00", region: "UTC / GMT" },

  // Asia
  { value: "Asia/Dhaka", label: "(UTC+06:00) Dhaka, Asia/Dhaka", iana: "Asia/Dhaka", offset: "+06:00", region: "Asia" },
  { value: "Asia/Tokyo", label: "(UTC+09:00) Tokyo, Osaka, Seoul, Asia/Tokyo", iana: "Asia/Tokyo", offset: "+09:00", region: "Asia" },
  { value: "Asia/Shanghai", label: "(UTC+08:00) Beijing, Shanghai, Taipei, Asia/Shanghai", iana: "Asia/Shanghai", offset: "+08:00", region: "Asia" },
  { value: "Asia/Singapore", label: "(UTC+08:00) Singapore, Kuala Lumpur, Asia/Singapore", iana: "Asia/Singapore", offset: "+08:00", region: "Asia" },
  { value: "Asia/Kolkata", label: "(UTC+05:30) India Standard Time (New Delhi, Mumbai), Asia/Kolkata", iana: "Asia/Kolkata", offset: "+05:30", region: "Asia" },
  { value: "Asia/Dubai", label: "(UTC+04:00) Dubai, Abu Dhabi, Muscat, Asia/Dubai", iana: "Asia/Dubai", offset: "+04:00", region: "Asia" },
  { value: "Asia/Bangkok", label: "(UTC+07:00) Bangkok, Hanoi, Jakarta, Asia/Bangkok", iana: "Asia/Bangkok", offset: "+07:00", region: "Asia" },
  { value: "Asia/Riyadh", label: "(UTC+03:00) Riyadh, Kuwait, Baghdad, Asia/Riyadh", iana: "Asia/Riyadh", offset: "+03:00", region: "Asia" },
  { value: "Asia/Karachi", label: "(UTC+05:00) Islamabad, Karachi, Asia/Karachi", iana: "Asia/Karachi", offset: "+05:00", region: "Asia" },
  { value: "Asia/Kathmandu", label: "(UTC+05:45) Kathmandu, Nepal, Asia/Kathmandu", iana: "Asia/Kathmandu", offset: "+05:45", region: "Asia" },
  { value: "Asia/Manila", label: "(UTC+08:00) Manila, Asia/Manila", iana: "Asia/Manila", offset: "+08:00", region: "Asia" },

  // Europe
  { value: "Europe/London", label: "(UTC+00:00) London, Dublin, Edinburgh, Europe/London", iana: "Europe/London", offset: "+00:00", region: "Europe" },
  { value: "Europe/Paris", label: "(UTC+01:00) Paris, Berlin, Rome, Madrid, Amsterdam, Europe/Paris", iana: "Europe/Paris", offset: "+01:00", region: "Europe" },
  { value: "Europe/Zurich", label: "(UTC+01:00) Zurich, Vienna, Brussels, Europe/Zurich", iana: "Europe/Zurich", offset: "+01:00", region: "Europe" },
  { value: "Europe/Athens", label: "(UTC+02:00) Athens, Istanbul, Bucharest, Helsinki, Europe/Athens", iana: "Europe/Athens", offset: "+02:00", region: "Europe" },
  { value: "Europe/Moscow", label: "(UTC+03:00) Moscow, St. Petersburg, Europe/Moscow", iana: "Europe/Moscow", offset: "+03:00", region: "Europe" },

  // Americas
  { value: "America/New_York", label: "(UTC-05:00) New York, Eastern Time (US & Canada), America/New_York", iana: "America/New_York", offset: "-05:00", region: "Americas" },
  { value: "America/Chicago", label: "(UTC-06:00) Chicago, Central Time (US & Canada), America/Chicago", iana: "America/Chicago", offset: "-06:00", region: "Americas" },
  { value: "America/Denver", label: "(UTC-07:00) Denver, Mountain Time (US & Canada), America/Denver", iana: "America/Denver", offset: "-07:00", region: "Americas" },
  { value: "America/Los_Angeles", label: "(UTC-08:00) Los Angeles, Pacific Time (US & Canada), America/Los_Angeles", iana: "America/Los_Angeles", offset: "-08:00", region: "Americas" },
  { value: "America/Toronto", label: "(UTC-05:00) Toronto, America/Toronto", iana: "America/Toronto", offset: "-05:00", region: "Americas" },
  { value: "America/Sao_Paulo", label: "(UTC-03:00) Sao Paulo, Brasilia, America/Sao_Paulo", iana: "America/Sao_Paulo", offset: "-03:00", region: "Americas" },
  { value: "America/Argentina/Buenos_Aires", label: "(UTC-03:00) Buenos Aires, America/Argentina/Buenos_Aires", iana: "America/Argentina/Buenos_Aires", offset: "-03:00", region: "Americas" },
  { value: "America/Mexico_City", label: "(UTC-06:00) Mexico City, America/Mexico_City", iana: "America/Mexico_City", offset: "-06:00", region: "Americas" },
  { value: "America/Anchorage", label: "(UTC-09:00) Alaska, America/Anchorage", iana: "America/Anchorage", offset: "-09:00", region: "Americas" },
  { value: "Pacific/Honolulu", label: "(UTC-10:00) Hawaii, Pacific/Honolulu", iana: "Pacific/Honolulu", offset: "-10:00", region: "Americas" },

  // Australia & Pacific
  { value: "Australia/Sydney", label: "(UTC+10:00) Sydney, Melbourne, Canberra, Australia/Sydney", iana: "Australia/Sydney", offset: "+10:00", region: "Australia & Pacific" },
  { value: "Australia/Adelaide", label: "(UTC+09:30) Adelaide, Australia/Adelaide", iana: "Australia/Adelaide", offset: "+09:30", region: "Australia & Pacific" },
  { value: "Australia/Perth", label: "(UTC+08:00) Perth, Australia/Perth", iana: "Australia/Perth", offset: "+08:00", region: "Australia & Pacific" },
  { value: "Pacific/Auckland", label: "(UTC+12:00) Auckland, Wellington, Pacific/Auckland", iana: "Pacific/Auckland", offset: "+12:00", region: "Australia & Pacific" },

  // Africa
  { value: "Africa/Cairo", label: "(UTC+02:00) Cairo, Africa/Cairo", iana: "Africa/Cairo", offset: "+02:00", region: "Africa" },
  { value: "Africa/Johannesburg", label: "(UTC+02:00) Johannesburg, Pretoria, Africa/Johannesburg", iana: "Africa/Johannesburg", offset: "+02:00", region: "Africa" },
  { value: "Africa/Lagos", label: "(UTC+01:00) Lagos, West Africa Time, Africa/Lagos", iana: "Africa/Lagos", offset: "+01:00", region: "Africa" },
  { value: "Africa/Nairobi", label: "(UTC+03:00) Nairobi, East Africa Time, Africa/Nairobi", iana: "Africa/Nairobi", offset: "+03:00", region: "Africa" }
];

export function getIanaFromValue(tzString?: string): string {
  if (!tzString) return "UTC";
  const str = tzString.trim();

  // Match exact IANA match from list
  const found = INTERNATIONAL_TIMEZONES.find(
    t => t.value === str || t.iana === str || t.label === str
  );
  if (found) return found.iana;

  // Regex check for IANA zone pattern like "Asia/Dhaka", "America/New_York", etc.
  const ianaMatch = str.match(/([A-Za-z_]+\/[A-Za-z_]+)/);
  if (ianaMatch) return ianaMatch[1];

  if (str.includes("Dhaka")) return "Asia/Dhaka";
  if (str.includes("Eastern") || str.includes("New_York")) return "America/New_York";
  if (str.includes("Paris") || str.includes("Berlin") || str.includes("Central European")) return "Europe/Paris";

  return "UTC";
}

export function formatDateWithTimeZone(
  dateInput: Date | string | number,
  timeZoneValue: string,
  dateFormat?: string
): string {
  if (!dateInput) return '';

  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // If it's already a relative label like "Today" or "7 days ago", return as-is
    if (trimmed === 'Today' || trimmed.includes('ago') || trimmed.includes('Yesterday')) {
      return trimmed;
    }
    // Convert "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    date = new Date(normalized);
    if (isNaN(date.getTime())) {
      date = new Date();
    }
  } else if (typeof dateInput === 'number') {
    date = new Date(dateInput);
    if (isNaN(date.getTime())) {
      date = new Date();
    }
  } else {
    date = new Date();
  }

  const iana = getIanaFromValue(timeZoneValue);

  try {
    if (dateFormat === 'Y-m-d H:i') {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: iana,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(date);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    if (dateFormat === 'd/m/Y H:i') {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: iana,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(date);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }

    // Default: "May 24, 2024 10:30 AM" format
    return new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
}

export function formatDateOnlyWithTimeZone(
  dateInput: Date | string | number,
  timeZoneValue: string
): string {
  if (!dateInput) return '';
  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    const str = String(dateInput).trim();
    if (str === 'Today' || str.includes('ago') || str.includes('Yesterday')) return str;
    const normalized = str.includes('T') ? str : str.replace(' ', 'T');
    date = new Date(normalized);
  }
  if (isNaN(date.getTime())) return String(dateInput);

  const iana = getIanaFromValue(timeZoneValue);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch (e) {
    return date.toLocaleDateString();
  }
}

export function formatTimeOnlyWithTimeZone(
  dateInput: Date | string | number,
  timeZoneValue: string
): string {
  if (!dateInput) return '';
  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    const str = String(dateInput).trim();
    if (str === 'Today' || str.includes('ago') || str.includes('Yesterday')) return '';
    const normalized = str.includes('T') ? str : str.replace(' ', 'T');
    date = new Date(normalized);
  }
  if (isNaN(date.getTime())) return '';

  const iana = getIanaFromValue(timeZoneValue);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return date.toLocaleTimeString();
  }
}

export function getLiveTimeInZone(timeZoneValue: string): string {
  const iana = getIanaFromValue(timeZoneValue);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(new Date());
  } catch (e) {
    return new Date().toLocaleString();
  }
}

/**
 * Re-formats a time that the server already sent in the site's own timezone,
 * e.g. "May 24, 2024 10:30:15 AM", according to the Date Format setting.
 * No timezone conversion happens here (the value is already site time).
 * Unknown text, or the default format, is returned unchanged.
 */
export function formatSiteLogTime(serverTime: string, dateFormat?: string): string {
  if (!serverTime || (dateFormat !== 'Y-m-d H:i' && dateFormat !== 'd/m/Y H:i')) {
    return serverTime;
  }
  const match = serverTime.trim().match(/^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2})(?::\d{2})? ?(AM|PM)$/i);
  if (!match) {
    return serverTime;
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIndex = months.indexOf(match[1].toLowerCase());
  if (monthIndex < 0) {
    return serverTime;
  }
  let hour = parseInt(match[4], 10) % 12;
  if (match[6].toUpperCase() === 'PM') {
    hour += 12;
  }
  const pad = (n: number | string) => String(n).padStart(2, '0');
  const day = pad(match[2]);
  const month = pad(monthIndex + 1);
  const time = `${pad(hour)}:${match[5]}`;
  return dateFormat === 'Y-m-d H:i'
    ? `${match[3]}-${month}-${day} ${time}`
    : `${day}/${month}/${match[3]} ${time}`;
}
