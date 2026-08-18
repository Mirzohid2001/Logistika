import { Platform, PermissionsAndroid } from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';

const recorder = new AudioRecorderPlayer();

export const MAX_VOICE_RECORDING_SECONDS = 120;

let playbackCompleteListener: (() => void) | null = null;
let recordingMaxTimer: ReturnType<typeof setTimeout> | null = null;
let recordingMaxCallback: (() => void) | null = null;

export function setVoicePlaybackCompleteListener(listener: (() => void) | null): void {
  playbackCompleteListener = listener;
}

export function setVoiceRecordingMaxListener(listener: (() => void) | null): void {
  recordingMaxCallback = listener;
}

export async function ensureMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function startVoiceRecording(): Promise<string> {
  const allowed = await ensureMicrophonePermission();
  if (!allowed) {
    throw new Error('microphone_permission_denied');
  }
  if (recordingMaxTimer) {
    clearTimeout(recordingMaxTimer);
    recordingMaxTimer = null;
  }
  const path = await recorder.startRecorder();
  recordingMaxTimer = setTimeout(() => {
    recordingMaxCallback?.();
  }, MAX_VOICE_RECORDING_SECONDS * 1000);
  return path;
}

export async function stopVoiceRecording(): Promise<string> {
  if (recordingMaxTimer) {
    clearTimeout(recordingMaxTimer);
    recordingMaxTimer = null;
  }
  return recorder.stopRecorder();
}

export async function cancelVoiceRecording(): Promise<void> {
  if (recordingMaxTimer) {
    clearTimeout(recordingMaxTimer);
    recordingMaxTimer = null;
  }
  try {
    await recorder.stopRecorder();
  } catch {
    // Recorder may already be stopped.
  }
}

export async function playVoiceMessage(uri: string): Promise<void> {
  await stopVoicePlayback();
  await recorder.startPlayer(uri);
  recorder.addPlayBackListener((event) => {
    const duration = Number(event.duration) || 0;
    const position = Number(event.currentPosition) || 0;
    if (duration > 0 && position >= duration - 80) {
      void stopVoicePlayback();
      playbackCompleteListener?.();
    }
  });
}

export async function stopVoicePlayback(): Promise<void> {
  try {
    await recorder.stopPlayer();
  } catch {
    // Player may already be stopped.
  }
  recorder.removePlayBackListener();
}

export function resetVoiceRecorder(): void {
  if (recordingMaxTimer) {
    clearTimeout(recordingMaxTimer);
    recordingMaxTimer = null;
  }
  void cancelVoiceRecording();
  void stopVoicePlayback();
}
