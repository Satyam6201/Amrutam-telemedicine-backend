import redis from '../../../config/redis.js';
import DoctorRepository from './doctor.repository.js';
import { NotFoundError } from '../../utils/errors.js';
import { hashPayload } from '../../utils/crypto.js';
import logger from '../../utils/logger.js';

export class DoctorService {
  /**
   * Search doctors with Redis caching for ultra-low p95 read latency (<50ms)
   */
  static async searchDoctors(filters) {
    const cacheKey = `cache:doctors:search:${hashPayload(filters)}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Doctor search served from Redis cache');
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis search cache read error');
    }

    const result = await DoctorRepository.searchDoctors(filters);

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // 5 min TTL
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis search cache write error');
    }

    return result;
  }

  /**
   * Get doctor by ID with cache-aside
   */
  static async getDoctorById(id) {
    const cacheKey = `cache:doctor:${id}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis doctor cache read error');
    }

    const doctor = await DoctorRepository.findDoctorById(id);
    if (!doctor) {
      throw new NotFoundError(`Doctor with ID ${id} not found.`);
    }

    try {
      await redis.set(cacheKey, JSON.stringify(doctor), 'EX', 600); // 10 min TTL
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis doctor cache write error');
    }

    return doctor;
  }

  static async getSpecialties() {
    const cacheKey = 'cache:specialties:all';
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {}

    const specialties = await DoctorRepository.getAllSpecialties();

    try {
      await redis.set(cacheKey, JSON.stringify(specialties), 'EX', 3600); // 1 hour TTL
    } catch (err) {}

    return specialties;
  }

  static async approveDoctor(id) {
    const doctor = await DoctorRepository.approveDoctor(id);
    if (!doctor) {
      throw new NotFoundError(`Doctor with ID ${id} not found.`);
    }
    // Invalidate caches
    await redis.del(`cache:doctor:${id}`);
    return doctor;
  }
}

export default DoctorService;
