/**
 * What the bot will accept as a voice note.
 *
 * A brain dump is a thought, not a lecture. The limit exists so an accidental long
 * recording is refused in words before anything is transcribed -- a transcription call
 * costs money and time, and refusing after paying for it helps nobody.
 */
export const MAX_VOICE_SECONDS = 5 * 60

export const tooLongToTranscribe = (seconds: number): boolean => seconds > MAX_VOICE_SECONDS
