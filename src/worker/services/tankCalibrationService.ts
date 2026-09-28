import { eq, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { AppDatabase } from '../../db';
import { formatMilliunits } from '../../shared/precision';

export interface CalibrationConversionResult {
  dipMilliunits: number;
  calculatedVolumeMilliunits: number;
  dipMmStr: string;
  volumeLitreStr: string;
  lowerCalibrationPoint: {
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
  };
  upperCalibrationPoint: {
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
  };
  interpolated: boolean;
}

export class TankCalibrationService {
  /**
   * Centralized deterministic dip-to-volume conversion using tank calibration chart.
   * Performs integer/scaled linear interpolation between calibrated dip points.
   */
  static async convertDipToVolume(
    db: AppDatabase,
    tankId: string,
    dipMilliunits: number
  ): Promise<CalibrationConversionResult> {
    if (dipMilliunits < 0) {
      const err = new Error('Dip measurement cannot be negative');
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }

    const points = await db
      .select()
      .from(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.tankId, tankId))
      .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

    if (!points || points.length < 2) {
      const err = new Error('Tank calibration chart is not configured (minimum 2 calibration points required)');
      (err as any).code = 'CALIBRATION_NOT_AVAILABLE';
      throw err;
    }

    const minPoint = points[0];
    const maxPoint = points[points.length - 1];

    if (dipMilliunits < minPoint.dipMillimetresMilliunits || dipMilliunits > maxPoint.dipMillimetresMilliunits) {
      const err = new Error(
        `Dip measurement ${formatMilliunits(dipMilliunits)} mm is out of range for tank calibration chart (${formatMilliunits(minPoint.dipMillimetresMilliunits)} mm - ${formatMilliunits(maxPoint.dipMillimetresMilliunits)} mm)`
      );
      (err as any).code = 'DIP_OUT_OF_RANGE';
      throw err;
    }

    // Exact match check
    const exact = points.find((p: any) => p.dipMillimetresMilliunits === dipMilliunits);
    if (exact) {
      return {
        dipMilliunits,
        calculatedVolumeMilliunits: exact.volumeMilliunits,
        dipMmStr: formatMilliunits(dipMilliunits),
        volumeLitreStr: formatMilliunits(exact.volumeMilliunits),
        lowerCalibrationPoint: {
          dipMillimetresMilliunits: exact.dipMillimetresMilliunits,
          volumeMilliunits: exact.volumeMilliunits,
        },
        upperCalibrationPoint: {
          dipMillimetresMilliunits: exact.dipMillimetresMilliunits,
          volumeMilliunits: exact.volumeMilliunits,
        },
        interpolated: false,
      };
    }

    // Binary search or linear segment search for bounding points
    let lowerPoint = minPoint;
    let upperPoint = maxPoint;

    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].dipMillimetresMilliunits <= dipMilliunits && dipMilliunits <= points[i + 1].dipMillimetresMilliunits) {
        lowerPoint = points[i];
        upperPoint = points[i + 1];
        break;
      }
    }

    // Linear Interpolation using integer BigInt arithmetic
    const deltaDip = BigInt(upperPoint.dipMillimetresMilliunits - lowerPoint.dipMillimetresMilliunits);
    const deltaVol = BigInt(upperPoint.volumeMilliunits - lowerPoint.volumeMilliunits);
    const offsetDip = BigInt(dipMilliunits - lowerPoint.dipMillimetresMilliunits);

    if (deltaDip === 0n) {
      return {
        dipMilliunits,
        calculatedVolumeMilliunits: lowerPoint.volumeMilliunits,
        dipMmStr: formatMilliunits(dipMilliunits),
        volumeLitreStr: formatMilliunits(lowerPoint.volumeMilliunits),
        lowerCalibrationPoint: {
          dipMillimetresMilliunits: lowerPoint.dipMillimetresMilliunits,
          volumeMilliunits: lowerPoint.volumeMilliunits,
        },
        upperCalibrationPoint: {
          dipMillimetresMilliunits: upperPoint.dipMillimetresMilliunits,
          volumeMilliunits: upperPoint.volumeMilliunits,
        },
        interpolated: false,
      };
    }

    const calcVol = BigInt(lowerPoint.volumeMilliunits) + (offsetDip * deltaVol) / deltaDip;
    const calculatedVolumeMilliunits = Number(calcVol);

    return {
      dipMilliunits,
      calculatedVolumeMilliunits,
      dipMmStr: formatMilliunits(dipMilliunits),
      volumeLitreStr: formatMilliunits(calculatedVolumeMilliunits),
      lowerCalibrationPoint: {
        dipMillimetresMilliunits: lowerPoint.dipMillimetresMilliunits,
        volumeMilliunits: lowerPoint.volumeMilliunits,
      },
      upperCalibrationPoint: {
        dipMillimetresMilliunits: upperPoint.dipMillimetresMilliunits,
        volumeMilliunits: upperPoint.volumeMilliunits,
      },
      interpolated: true,
    };
  }
}
