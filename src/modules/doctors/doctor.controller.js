import DoctorService from './doctor.service.js';
import { successResponse, paginatedResponse } from '../../utils/response.js';

export class DoctorController {
  static async searchDoctors(req, res, next) {
    try {
      const result = await DoctorService.searchDoctors(req.query);
      return paginatedResponse(
        res,
        result.doctors,
        result.page,
        result.limit,
        result.total,
        'Doctors retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  static async getDoctorById(req, res, next) {
    try {
      const doctor = await DoctorService.getDoctorById(req.params.id);
      return successResponse(res, doctor, 'Doctor details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getSpecialties(req, res, next) {
    try {
      const specialties = await DoctorService.getSpecialties();
      return successResponse(res, specialties, 'Specialties catalog retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async approveDoctor(req, res, next) {
    try {
      const doctor = await DoctorService.approveDoctor(req.params.id);
      return successResponse(res, doctor, 'Doctor approved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export default DoctorController;
