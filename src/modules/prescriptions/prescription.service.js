import PrescriptionRepository from './prescription.repository.js';
import ConsultationRepository from '../consultations/consultation.repository.js';
import { notificationQueue } from '../../../config/queue.js';
import { encryptPHI, decryptPHI, generatePrescriptionSignature } from '../../utils/crypto.js';
import { logAuditEvent } from '../../middlewares/auditLogger.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export class PrescriptionService {
  /**
   * Issue a digitally signed, encrypted digital prescription
   */
  static async issuePrescription(
    { consultationId, diagnosis, medications, advice, followUpDate },
    requestingDoctorUser,
    clientIp,
    userAgent
  ) {
    // 1. Fetch consultation
    const consultation = await ConsultationRepository.findById(consultationId);
    if (!consultation) {
      throw new NotFoundError(`Consultation with ID ${consultationId} not found.`);
    }

    // 2. Verify requesting user is the assigned doctor
    if (consultation.doctor_user_id !== requestingDoctorUser.id && requestingDoctorUser.role !== 'ADMIN') {
      throw new ForbiddenError('Only the assigned doctor can issue prescriptions for this consultation.');
    }

    // 3. Encrypt diagnosis (PHI)
    const encryptedDiagnosis = encryptPHI(diagnosis);

    // 4. Generate digital cryptographic signature
    const issuedAt = new Date().toISOString();
    const digitalSignature = generatePrescriptionSignature({
      doctorId: consultation.doctor_id,
      consultationId,
      patientId: consultation.patient_id,
      issuedAt,
      medications,
    });

    // 5. Store prescription
    const prescription = await PrescriptionRepository.createPrescription({
      consultationId,
      doctorId: consultation.doctor_id,
      patientId: consultation.patient_id,
      encryptedDiagnosis,
      medications,
      advice,
      followUpDate,
      digitalSignature,
    });

    // 6. Automatically complete consultation if not already completed
    if (consultation.status !== 'COMPLETED') {
      await ConsultationRepository.updateStatus({
        id: consultationId,
        status: 'COMPLETED',
        scheduledAt: consultation.scheduled_at,
      });
    }

    // 7. Enqueue background notification to patient
    try {
      await notificationQueue.add(
        'prescription-ready',
        {
          prescriptionId: prescription.id,
          consultationId,
          patientId: consultation.patient_id,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to enqueue prescription notification');
    }

    // 8. Record audit log
    await logAuditEvent({
      userId: requestingDoctorUser.id,
      action: 'PRESCRIPTION_ISSUED',
      resourceType: 'PRESCRIPTION',
      resourceId: prescription.id,
      ipAddress: clientIp,
      userAgent,
      previousState: null,
      newState: {
        consultationId,
        digitalSignature,
        medicationCount: medications.length,
      },
    });

    return {
      ...prescription,
      diagnosis, // Unencrypted for the immediate issuer response
    };
  }

  /**
   * Get prescription by consultation ID with decrypted PHI
   */
  static async getByConsultationId(consultationId, requestingUser) {
    const prescription = await PrescriptionRepository.findByConsultationId(consultationId);
    if (!prescription) {
      throw new NotFoundError(`No prescription found for consultation ID ${consultationId}.`);
    }

    // Access control: only patient, doctor, or admin
    const isPatient = prescription.patient_id === requestingUser.id;
    const isDoctor = prescription.doctor_user_id === requestingUser.id;
    const isAdmin = requestingUser.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new ForbiddenError('You are not authorized to access this prescription.');
    }

    let decryptedDiagnosis = null;
    try {
      decryptedDiagnosis = decryptPHI(prescription.encrypted_diagnosis);
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to decrypt prescription diagnosis');
    }

    return {
      ...prescription,
      diagnosis: decryptedDiagnosis,
      encrypted_diagnosis: undefined,
    };
  }
}

export default PrescriptionService;
