import AnalyticsService from './analytics.service.js';
import { successResponse } from '../../utils/response.js';

export class AnalyticsController {
  static async getOverview(req, res, next) {
    try {
      const data = await AnalyticsService.getOverviewMetrics();
      return successResponse(res, data, 'System overview analytics');
    } catch (error) {
      next(error);
    }
  }

  static async getDoctorUtilization(req, res, next) {
    try {
      const data = await AnalyticsService.getDoctorUtilization();
      return successResponse(res, data, 'Doctor utilization statistics');
    } catch (error) {
      next(error);
    }
  }

  static async getPeakHoursAndRetention(req, res, next) {
    try {
      const data = await AnalyticsService.getPeakHoursAndRetention();
      return successResponse(res, data, 'Peak consultation hours and patient retention analytics');
    } catch (error) {
      next(error);
    }
  }
}

export default AnalyticsController;

