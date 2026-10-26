import SlotService from './slot.service.js';
import DoctorRepository from '../doctors/doctor.repository.js';
import { successResponse } from '../../utils/response.js';
import { ForbiddenError } from '../../utils/errors.js';

export class SlotController {
  static async getDoctorSlots(req, res, next) {
    try {
      const { doctorId } = req.params;
      const { date, status } = req.query;
      const slots = await SlotService.getDoctorSlots(doctorId, date, status);
      return successResponse(res, slots, 'Doctor availability slots retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async holdSlot(req, res, next) {
    try {
      const { slotId } = req.body;
      const patientId = req.user.id;
      const heldSlot = await SlotService.holdSlot(slotId, patientId);
      return successResponse(res, heldSlot, 'Slot held successfully for 15 minutes');
    } catch (error) {
      next(error);
    }
  }

  static async releaseSlot(req, res, next) {
    try {
      const { slotId } = req.body;
      const patientId = req.user.id;
      const releasedSlot = await SlotService.releaseSlot(slotId, patientId);
      return successResponse(res, releasedSlot, 'Slot hold released successfully');
    } catch (error) {
      next(error);
    }
  }

  static async bulkCreateSlots(req, res, next) {
    try {

      const doctor = await DoctorRepository.findDoctorById(req.params.doctorId);
      if (!doctor || (req.user.role === 'DOCTOR' && doctor.user_id !== req.user.id)) {
        throw new ForbiddenError('You can only create slots for your own doctor profile');
      }

      const { date, slots } = req.body;
      const createdSlots = await SlotService.bulkCreateSlots(doctor.id, date, slots);
      return successResponse(res, createdSlots, 'Availability slots created', 201);
    } catch (error) {
      next(error);
    }
  }
}

export default SlotController;

