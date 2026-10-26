import crypto from 'crypto';
import ConsultationRepository from './consultation.repository.js';
import DoctorRepository from '../doctors/doctor.repository.js';
import SlotRepository from '../slots/slot.repository.js';
import { notificationQueue } from '../../../config/queue.js';
import { encryptPHI, decryptPHI } from '../../utils/crypto.js';
import { logAuditEvent } from '../../middlewares/auditLogger.js';
import {
  consultationBookingsCounter,
  activeConsultationsGauge,
} from '../../middlewares/metrics.js';
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export class ConsultationService {
  /**
   * Book consultation saga
   */
  static async bookConsultation(
    { slotId, doctorId, symptoms, scheduledAt },
    patientId,
    clientIp,
    userAgent
  ) {
    // 1. Verify doctor exists and is approved
    const doctor = await DoctorRepository.findDoctorById(doctorId);
    if (!doctor) {
      throw new NotFoundError(`Doctor with ID ${doctorId} not found.`);
    }

    if (!doctor.is_approved) {
      throw new BadRequestError('Doctor is currently pending verification and cannot accept bookings.');
    }

    // 2. Encrypt Patient Health Information (PHI)
    const encryptedSymptoms = encryptPHI(symptoms);

    // 3. Generate secure video room token URL
    const roomId = `room-${crypto.randomUUID().slice(0, 8)}`;
    const videoRoomUrl = `https://meet.amrutam.co.in/consultation/${roomId}`;

    // 4. Create consultation with atomic slot confirmation
    let consultation;
    try {
      consultation = await ConsultationRepository.createConsultation({
        doctorId,
        patientId,
        slotId,
        scheduledAt,
        encryptedSymptoms,
        videoRoomUrl,
      });
      consultationBookingsCounter.labels('success').inc();
    } catch (err) {
      if (err.message === 'SLOT_UNAVAILABLE') {
        consultationBookingsCounter.labels('failed_conflict').inc();
        throw new ConflictError('The selected slot is no longer available. Please select another slot.');
      }
      throw err;
    }

    // 5. Enqueue background notification job (email & SMS)
    try {
      await notificationQueue.add(
        'consultation-confirmation',
        {
          consultationId: consultation.id,
          doctorId,
          patientId,
          scheduledAt,
          videoRoomUrl,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to enqueue consultation notification');
    }

    // 6. Record tamper-evident audit log
    await logAuditEvent({
      userId: patientId,
      action: 'CONSULTATION_BOOKED',
      resourceType: 'CONSULTATION',
      resourceId: consultation.id,
      ipAddress: clientIp,
      userAgent,
      previousState: null,
      newState: {
        doctorId,
        patientId,
        slotId,
        scheduledAt,
        status: consultation.status,
      },
    });

    return {
      ...consultation,
      symptoms, // Return unencrypted for the creator's immediate response
    };
  }

  /**
   * Get consultation details with decrypted PHI (only if authorized)
   */
  static async getConsultationById(id, requestingUser) {
    const consultation = await ConsultationRepository.findById(id);
    if (!consultation) {
      throw new NotFoundError(`Consultation with ID ${id} not found.`);
    }

    // Access control: Only assigned patient, assigned doctor, or admin can view
    const isPatient = consultation.patient_id === requestingUser.id;
    const isDoctor = consultation.doctor_user_id === requestingUser.id;
    const isAdmin = requestingUser.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new ForbiddenError('You do not have permission to view this medical consultation record.');
    }

    // Decrypt PHI
    let decryptedSymptoms = null;
    let decryptedNotes = null;
    try {
      if (consultation.encrypted_symptoms) {
        decryptedSymptoms = decryptPHI(consultation.encrypted_symptoms);
      }
      if (consultation.encrypted_clinical_notes) {
        decryptedNotes = decryptPHI(consultation.encrypted_clinical_notes);
      }
    } catch (err) {
      logger.error({ err: err.message, id }, 'Failed to decrypt consultation PHI');
    }

    return {
      ...consultation,
      symptoms: decryptedSymptoms,
      clinicalNotes: decryptedNotes,
      encrypted_symptoms: undefined,
      encrypted_clinical_notes: undefined,
    };
  }

  /**
   * List consultations with pagination
   */
  static async listConsultations(requestingUser, queryParams) {
    return ConsultationRepository.listConsultations({
      userId: requestingUser.id,
      role: requestingUser.role,
      status: queryParams.status,
      page: queryParams.page,
      limit: queryParams.limit,
    });
  }

  /**
   * Update consultation status (IN_PROGRESS, COMPLETED, CANCELLED)
   */
  static async updateStatus(id, { status, cancellationReason, clinicalNotes }, requestingUser, clientIp, userAgent) {
    const existing = await ConsultationRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Consultation with ID ${id} not found.`);
    }

    // Role checks
    const isDoctor = existing.doctor_user_id === requestingUser.id;
    const isPatient = existing.patient_id === requestingUser.id;
    const isAdmin = requestingUser.role === 'ADMIN';

    if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
      if (!isDoctor && !isAdmin) {
        throw new ForbiddenError('Only the assigned physician can transition consultation to IN_PROGRESS or COMPLETED.');
      }
    }

    let encryptedNotes = null;
    if (clinicalNotes) {
      encryptedNotes = encryptPHI(clinicalNotes);
    }

    // If cancelling, release the slot
    if (status === 'CANCELLED') {
      if (!isDoctor && !isPatient && !isAdmin) {
        throw new ForbiddenError('Not authorized to cancel this consultation');
      }
      if (existing.slot_id) {
        await SlotRepository.releaseSlot(existing.slot_id, existing.patient_id);
      }
    }

    const updated = await ConsultationRepository.updateStatus({
      id,
      status,
      scheduledAt: existing.scheduled_at,
      cancellationReason,
      encryptedNotes,
    });

    // Update metrics
    if (status === 'IN_PROGRESS') {
      activeConsultationsGauge.inc();
    } else if (existing.status === 'IN_PROGRESS' && (status === 'COMPLETED' || status === 'CANCELLED')) {
      activeConsultationsGauge.dec();
    }

    // Audit log
    await logAuditEvent({
      userId: requestingUser.id,
      action: `CONSULTATION_${status}`,
      resourceType: 'CONSULTATION',
      resourceId: id,
      ipAddress: clientIp,
      userAgent,
      previousState: { status: existing.status },
      newState: { status: updated.status, cancellationReason },
    });

    return updated;
  }
}

export default ConsultationService;
