export interface YouTubeVideoTutorial {
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationText: string;
}

interface YouTubeSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

interface YouTubeVideoItem {
  id?: string;
  contentDetails?: {
    duration?: string;
  };
}

interface YouTubeVideoListResponse {
  items?: YouTubeVideoItem[];
}

/**
 * Parses an ISO 8601 duration string (e.g. PT2M30S, PT45S) into human readable "X min".
 */
export function formatIsoDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return '2 min';
  }
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  const totalMinutes = hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
  return `${Math.max(1, totalMinutes)} min`;
}

export class YouTubeService {
  private apiKey: string;
  private searchEndpoint = 'https://www.googleapis.com/youtube/v3/search';
  private videosEndpoint = 'https://www.googleapis.com/youtube/v3/videos';
  private defaultTimeoutMs = 4000;

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || '';
  }

  /**
   * Searches for a product application tutorial on YouTube and retrieves video metadata.
   * Returns null safely on quota limit, network error, or missing API key without failing the pipeline.
   */
  async findTutorial(
    brand: string,
    productName: string
  ): Promise<YouTubeVideoTutorial | null> {
    if (!this.apiKey) {
      return null;
    }

    const query = `${brand} ${productName} how to apply tutorial skincare`;

    try {
      // 1. Search for top tutorial video
      const searchUrl = `${this.searchEndpoint}?part=snippet&q=${encodeURIComponent(
        query
      )}&type=video&maxResults=1&key=${this.apiKey}`;

      const searchController = new AbortController();
      const searchTimer = setTimeout(() => searchController.abort(), this.defaultTimeoutMs);

      const searchRes = await fetch(searchUrl, { signal: searchController.signal });
      clearTimeout(searchTimer);

      if (!searchRes.ok) {
        console.warn(
          `[YouTubeService] Search failed with status ${searchRes.status}. Quota or network limit.`
        );
        return null;
      }

      const searchData = (await searchRes.json()) as YouTubeSearchResponse;
      const topItem = searchData.items?.[0];
      const videoId = topItem?.id?.videoId;

      if (!videoId || !topItem.snippet) {
        return null;
      }

      const title = topItem.snippet.title || `${brand} ${productName} Tutorial`;
      const thumbnailUrl =
        topItem.snippet.thumbnails?.high?.url ||
        topItem.snippet.thumbnails?.medium?.url ||
        topItem.snippet.thumbnails?.default?.url ||
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // 2. Fetch video duration
      let durationText = '2 min';
      try {
        const videoDetailsUrl = `${this.videosEndpoint}?part=contentDetails&id=${videoId}&key=${this.apiKey}`;
        const videoController = new AbortController();
        const videoTimer = setTimeout(() => videoController.abort(), this.defaultTimeoutMs);

        const detailsRes = await fetch(videoDetailsUrl, { signal: videoController.signal });
        clearTimeout(videoTimer);

        if (detailsRes.ok) {
          const detailsData = (await detailsRes.json()) as YouTubeVideoListResponse;
          const isoDuration = detailsData.items?.[0]?.contentDetails?.duration;
          if (isoDuration) {
            durationText = formatIsoDuration(isoDuration);
          }
        }
      } catch (err) {
        // Fall back to default duration on failure
        console.warn('[YouTubeService] Failed to fetch video duration details:', err);
      }

      return {
        title,
        videoUrl,
        thumbnailUrl,
        durationText,
      };
    } catch (err) {
      console.warn('[YouTubeService] Error querying YouTube API:', err);
      return null;
    }
  }
}

export const youtubeService = new YouTubeService();
