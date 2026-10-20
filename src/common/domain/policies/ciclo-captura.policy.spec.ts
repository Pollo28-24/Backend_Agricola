import { HttpStatus } from '@nestjs/common';
import { EstadoCiclo } from '@prisma/client';
import { CicloCapturaPolicy } from './ciclo-captura.policy';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

describe('CicloCapturaPolicy', () => {
  let policy: CicloCapturaPolicy;

  beforeEach(() => {
    policy = new CicloCapturaPolicy();
  });

  describe('assertCaptureAllowed (RN-015 / Tabla 2.6)', () => {
    it('debe permitir captura de actividad y gasto en ciclo PLANIFICADO', () => {
      expect(() =>
        policy.assertCaptureAllowed(
          { estado: EstadoCiclo.PLANIFICADO },
          'actividad',
        ),
      ).not.toThrow();
      expect(() =>
        policy.assertCaptureAllowed(
          { estado: EstadoCiclo.PLANIFICADO },
          'gasto',
        ),
      ).not.toThrow();
      // default sin segundo argumento
      expect(() =>
        policy.assertCaptureAllowed({ estado: EstadoCiclo.PLANIFICADO }),
      ).not.toThrow();
    });

    it('debe rechazar captura de cosecha y merma en ciclo PLANIFICADO con CICLO_NO_ACTIVO (409)', () => {
      expect(() =>
        policy.assertCaptureAllowed(
          { estado: EstadoCiclo.PLANIFICADO },
          'cosecha',
        ),
      ).toThrow(
        new DomainError(
          CodigoError.CICLO_NO_ACTIVO,
          'No se permite capturar cosechas en un ciclo en estado PLANIFICADO. El ciclo debe estar ACTIVO o SUSPENDIDO (Tabla 2.6)',
          HttpStatus.CONFLICT,
        ),
      );

      expect(() =>
        policy.assertCaptureAllowed(
          { estado: EstadoCiclo.PLANIFICADO },
          'merma',
        ),
      ).toThrow(
        new DomainError(
          CodigoError.CICLO_NO_ACTIVO,
          'No se permite capturar mermas en un ciclo en estado PLANIFICADO. El ciclo debe estar ACTIVO o SUSPENDIDO (Tabla 2.6)',
          HttpStatus.CONFLICT,
        ),
      );
    });

    it('debe permitir captura de cualquier tipo en ciclos ACTIVO y SUSPENDIDO', () => {
      for (const estado of [EstadoCiclo.ACTIVO, EstadoCiclo.SUSPENDIDO]) {
        expect(() =>
          policy.assertCaptureAllowed({ estado }, 'actividad'),
        ).not.toThrow();
        expect(() =>
          policy.assertCaptureAllowed({ estado }, 'gasto'),
        ).not.toThrow();
        expect(() =>
          policy.assertCaptureAllowed({ estado }, 'cosecha'),
        ).not.toThrow();
        expect(() =>
          policy.assertCaptureAllowed({ estado }, 'merma'),
        ).not.toThrow();
      }
    });

    it('debe rechazar cualquier captura en ciclos FINALIZADO o CANCELADO con CICLO_CERRADO (409)', () => {
      for (const estado of [EstadoCiclo.FINALIZADO, EstadoCiclo.CANCELADO]) {
        for (const tipo of [
          'actividad',
          'gasto',
          'cosecha',
          'merma',
        ] as const) {
          expect(() => policy.assertCaptureAllowed({ estado }, tipo)).toThrow(
            new DomainError(
              CodigoError.CICLO_CERRADO,
              `No se permite capturar ni modificar registros en un ciclo en estado ${estado} (RN-015)`,
              HttpStatus.CONFLICT,
            ),
          );
        }
      }
    });
  });

  describe('assertFechaCoherente (RN-044)', () => {
    const fechaInicio = new Date('2027-01-10T00:00:00.000Z');

    it('debe permitir fechas iguales o posteriores al inicio del ciclo', () => {
      expect(() =>
        policy.assertFechaCoherente(
          { fechaInicio },
          new Date('2027-01-10T00:00:00.000Z'),
          'cosecha',
        ),
      ).not.toThrow();
      expect(() =>
        policy.assertFechaCoherente(
          { fechaInicio },
          new Date('2027-01-15T00:00:00.000Z'),
          'merma',
        ),
      ).not.toThrow();
    });

    it('debe rechazar fechas anteriores con FECHA_ANTERIOR_AL_INICIO (400)', () => {
      expect(() =>
        policy.assertFechaCoherente(
          { fechaInicio },
          new Date('2027-01-09T23:59:59.000Z'),
          'cosecha',
        ),
      ).toThrow(
        new DomainError(
          CodigoError.FECHA_ANTERIOR_AL_INICIO,
          'La fecha de la cosecha no puede ser anterior a la fecha de inicio del ciclo (RN-044)',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });
  });
});
