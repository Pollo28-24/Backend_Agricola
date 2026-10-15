import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const ZONA_HORARIA_DEFAULT = 'America/Mexico_City';

export class FechaUtil {
  public static hoyLocal(zona: string = ZONA_HORARIA_DEFAULT): string {
    return dayjs().tz(zona).format('YYYY-MM-DD');
  }

  public static ahoraUtc(): Date {
    return dayjs.utc().toDate();
  }

  public static esFechaPasada(
    fecha: Date | string,
    zona: string = ZONA_HORARIA_DEFAULT,
  ): boolean {
    const fechaObj = dayjs(fecha).tz(zona).startOf('day');
    const hoy = dayjs().tz(zona).startOf('day');
    return fechaObj.isBefore(hoy);
  }

  public static horasTranscurridas(desde: Date | string): number {
    const inicio = dayjs(desde);
    const ahora = dayjs();
    return ahora.diff(inicio, 'hour', true);
  }

  public static toDateOnly(fecha: Date | string): string {
    return dayjs(fecha).format('YYYY-MM-DD');
  }
}
