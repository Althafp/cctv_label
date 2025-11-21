/**
 * Extracts IP address from image filename
 * Format: "(_Bathalapalli_Road)_Kadapa_-_Anantapur_Border_10_251_14_7_20251120_212726.jpg"
 * IP: 10.251.14.7 (numbers separated by underscores before the date)
 */
export function extractIPFromFilename(filename: string): string | null {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|JPG|JPEG|PNG)$/i, '');
  
  // Pattern: Look for date pattern (8 digits like 20251120) and extract numbers before it
  // The IP is typically in format: 10_251_14_7_ or 10_251_14_7 (numbers separated by underscores)
  const datePattern = /(\d{8})/; // 8 digit date
  const dateMatch = nameWithoutExt.match(datePattern);
  
  if (!dateMatch) {
    return null;
  }
  
  const dateIndex = dateMatch.index!;
  const beforeDate = nameWithoutExt.substring(0, dateIndex);
  
  // Remove trailing underscores (there might be an underscore before the date)
  const cleanedBeforeDate = beforeDate.replace(/_+$/, '');
  
  // Extract the last sequence of numbers separated by underscores (this should be the IP)
  // Pattern: match 4 groups of digits separated by underscores (e.g., 10_251_14_7)
  // This is the standard IP format with 4 octets
  const ipPattern = /(\d+_\d+_\d+_\d+)$/;
  const ipMatch = cleanedBeforeDate.match(ipPattern);
  
  if (ipMatch) {
    // Convert underscores to dots: 10_251_14_7 -> 10.251.14.7
    const ip = ipMatch[1].replace(/_/g, '.');
    return ip;
  }
  
  // Fallback: try to find any sequence of 3+ groups of digits separated by underscores
  const fallbackPattern = /(\d+(?:_\d+){2,})$/;
  const fallbackMatch = cleanedBeforeDate.match(fallbackPattern);
  
  if (fallbackMatch) {
    const ip = fallbackMatch[1].replace(/_/g, '.');
    return ip;
  }
  
  return null;
}

/**
 * Normalizes IP address for comparison (handles different formats)
 */
export function normalizeIP(ip: string): string {
  return ip.trim().replace(/\s+/g, '');
}

