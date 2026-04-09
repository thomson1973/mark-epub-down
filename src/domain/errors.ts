export class ConversionError extends Error {
  public readonly code: string;
  public readonly fatal: boolean;
  public readonly exitCode: number;

  public constructor(code: string, message: string, fatal = true, exitCode = 1) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
    this.fatal = fatal;
    this.exitCode = exitCode;
  }

  public static fatal(code: string, message: string): ConversionError {
    return new ConversionError(code, message, true, 1);
  }
}
