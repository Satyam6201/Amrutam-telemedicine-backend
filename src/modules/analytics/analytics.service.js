import redis from '../../../config/redis.js';
import AnalyticsRepository from './analytics.repository.js';
import logger from '../../utils/logger.js';

export class AnalyticsService {
  static async getOverviewMetrics() {
    const cacheKey = 'cache:analytics:overview';
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis analytics cache read error');
    }

    const data = await AnalyticsRepository.getOverviewMetrics();

    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
    } catch (err) {}

    return data;
  }

  static async getDoctorUtilization() {
    const cacheKey = 'cache:analytics:doctor-utilization';
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {}

    const data = await AnalyticsRepository.getDoctorUtilization();

    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
    } catch (err) {}

    return data;
  }

  static async getPeakHoursAndRetention() {
    const cacheKey = 'cache:analytics:peak-hours-retention';
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {}

    const data = await AnalyticsRepository.getPeakHoursAndRetention();

    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', 600);
    } catch (err) {}

    return data;
  }
}

export default AnalyticsService;

