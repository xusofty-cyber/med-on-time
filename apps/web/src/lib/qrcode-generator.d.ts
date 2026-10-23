/** qrcode-generator (MIT, Kazuhiko Arase) 的最小类型声明：仅覆盖本项目用到的接口。 */
declare module './qrcode-generator.js' {
  interface QrCodeInstance {
    addData(data: string, mode?: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: string): QrCodeInstance;
  export default qrcode;
}
