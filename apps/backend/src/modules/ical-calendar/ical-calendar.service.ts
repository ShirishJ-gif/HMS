import { BadRequestException, Injectable } from '@nestjs/common';

const maxICalBytes = 2 * 1024 * 1024;
const fetchTimeoutMs = 12_000;
const blockedHostnames = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1']);

@Injectable()
export class ICalCalendarService {
  async fetchCalendar(url: string) {
    const parsedUrl = this.validateUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

    try {
      const response = await fetch(parsedUrl.toString(), {
        headers: {
          Accept: 'text/calendar,text/plain,*/*',
          'User-Agent': 'HMS-iCal-Calendar/1.0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException(`Calendar returned HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > maxICalBytes) {
        throw new BadRequestException('Calendar file is too large.');
      }

      const content = await response.text();
      if (Buffer.byteLength(content, 'utf8') > maxICalBytes) {
        throw new BadRequestException('Calendar file is too large.');
      }

      if (!content.includes('BEGIN:VCALENDAR')) {
        throw new BadRequestException('The link did not return iCal content.');
      }

      return {
        url: parsedUrl.toString(),
        content,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadRequestException('Calendar request timed out.');
      }
      throw new BadRequestException('Failed to fetch iCal calendar.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateUrl(url: string) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Enter a valid iCal URL.');
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new BadRequestException('Only HTTP and HTTPS calendar links are supported.');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      blockedHostnames.has(hostname) ||
      hostname.endsWith('.localhost') ||
      this.isPrivateIPv4(hostname)
    ) {
      throw new BadRequestException('Private network calendar links are not supported.');
    }

    parsedUrl.hash = '';
    return parsedUrl;
  }

  private isPrivateIPv4(hostname: string) {
    const parts = hostname.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    const [first, second] = parts;
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }
}
