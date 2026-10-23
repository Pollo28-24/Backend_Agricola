import { detectarTipoPorFirma, sanearNombreArchivo } from './magic-bytes.util';

describe('magic-bytes.util', () => {
  describe('detectarTipoPorFirma', () => {
    it('debe detectar JPEG válidos', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const res = detectarTipoPorFirma(buffer);
      expect(res).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    });

    it('debe detectar PNG válidos', () => {
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
      ]);
      const res = detectarTipoPorFirma(buffer);
      expect(res).toEqual({ mime: 'image/png', ext: 'png' });
    });

    it('debe detectar WEBP válidos', () => {
      const header = Buffer.alloc(16);
      header.write('RIFF', 0, 'ascii');
      header.writeUInt32LE(100, 4);
      header.write('WEBP', 8, 'ascii');
      const res = detectarTipoPorFirma(header);
      expect(res).toEqual({ mime: 'image/webp', ext: 'webp' });
    });

    it('debe detectar PDF válidos', () => {
      const buffer = Buffer.from('%PDF-1.7\n%cuerpo del pdf');
      const res = detectarTipoPorFirma(buffer);
      expect(res).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    });

    it('debe retornar null para buffer nulo o undefined', () => {
      expect(detectarTipoPorFirma(null)).toBeNull();
      expect(detectarTipoPorFirma(undefined)).toBeNull();
    });

    it('debe retornar null para buffer menor a 4 bytes', () => {
      expect(detectarTipoPorFirma(Buffer.from([0xff, 0xd8]))).toBeNull();
    });

    it('debe retornar null para firmas no reconocidas o ejecutables/scripts disfrazados', () => {
      const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      expect(detectarTipoPorFirma(fakeExe)).toBeNull();

      const fakeHtml = Buffer.from('<html><body>hola</body></html>');
      expect(detectarTipoPorFirma(fakeHtml)).toBeNull();
    });
  });

  describe('sanearNombreArchivo', () => {
    it('debe devolver nombre seguro cuando es válido', () => {
      expect(sanearNombreArchivo('factura-2026.pdf')).toBe('factura-2026.pdf');
    });

    it('debe eliminar path traversal relativo y absoluto', () => {
      expect(sanearNombreArchivo('../../../etc/passwd')).toBe('passwd');
      expect(sanearNombreArchivo('..\\..\\Windows\\System32\\cmd.exe')).toBe(
        'cmd.exe',
      );
      expect(sanearNombreArchivo('/var/www/uploads/comprobante.png')).toBe(
        'comprobante.png',
      );
    });

    it('debe eliminar caracteres nulos y de control', () => {
      expect(sanearNombreArchivo('archivo\x00malicioso.pdf')).toBe(
        'archivomalicioso.pdf',
      );
      expect(sanearNombreArchivo('doc\x1f\x7f.jpg')).toBe('doc.jpg');
    });

    it('debe manejar entradas vacías o inválidas asignando fallback', () => {
      expect(sanearNombreArchivo('')).toBe('archivo');
      expect(sanearNombreArchivo(null)).toBe('archivo');
      expect(sanearNombreArchivo(undefined)).toBe('archivo');
      expect(sanearNombreArchivo('   ')).toBe('archivo');
    });

    it('debe truncar nombres extremadamente largos preservando la extensión', () => {
      const nombreLargo = 'a'.repeat(300) + '.png';
      const saneado = sanearNombreArchivo(nombreLargo);
      expect(saneado.length).toBeLessThanOrEqual(255);
      expect(saneado.endsWith('.png')).toBe(true);
    });
  });
});
