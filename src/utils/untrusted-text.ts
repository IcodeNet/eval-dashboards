/** CSI and OSC escape sequences: colour, cursor moves, screen clears and window titles. */
const ESCAPE_SEQUENCES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g;

/** C0 and C1 control characters except tab and newline, which are safe to print. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Remove terminal control codes from artifact-derived text before it reaches a console or CI log. */
export const stripControlCharacters = (value: string): string =>
  value.replace(ESCAPE_SEQUENCES, '').replace(CONTROL_CHARACTERS, '');
