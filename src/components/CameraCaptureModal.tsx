import React, { useEffect, useRef, useState } from 'react';
import { Camera, Video, X, RefreshCw, Circle, Square, Check } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptureFile,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      return;
    }
    startCamera(facingMode);
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  useEffect(() => {
    let timer: number | undefined;
    if (isRecording) {
      timer = window.setInterval(() => {
        setRecordingSec((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSec(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  const stopStream = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsRecording(false);
  };

  const startCamera = async (facing: 'environment' | 'user') => {
    setErrorMsg(null);
    stopStream();
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      // Fallback without audio if microphone permission is denied
      try {
        const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setStream(videoOnlyStream);
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnlyStream;
        }
      } catch (innerErr: any) {
        setErrorMsg(
          'Camera access unavailable. You can still select photos and videos directly from your phone gallery.'
        );
      }
    }
  };

  const handleTakePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `catbox-photo-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        onCaptureFile(file);
        onClose();
      },
      'image/jpeg',
      0.92
    );
  };

  const handleToggleVideoRecord = () => {
    if (!stream) return;
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `catbox-clip-${Date.now()}.${ext}`, {
        type: mimeType,
      });
      onCaptureFile(file);
      onClose();
    };

    recorder.start(250);
    setIsRecording(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between max-w-lg w-full mx-auto pt-2">
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Close camera"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
          {isRecording && (
            <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48] animate-pulse" />
          )}
          <span className="font-mono-tabular">
            {isRecording
              ? `REC 00:${recordingSec.toString().padStart(2, '0')}`
              : mode === 'photo'
              ? 'Camera Snapshot'
              : 'Video Recorder'}
          </span>
        </div>

        <button
          onClick={() =>
            setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
          }
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Switch camera"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Viewport */}
      <div className="relative max-w-lg w-full mx-auto my-4 flex-1 flex items-center justify-center rounded-3xl overflow-hidden bg-[#131720] border border-white/10">
        {errorMsg ? (
          <div className="p-6 text-center max-w-xs">
            <Camera className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm text-slate-200 leading-relaxed mb-4">{errorMsg}</p>
            <button
              onClick={onClose}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E11D48] text-white text-xs font-semibold"
            >
              Back to Gallery Picker
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Bottom Thumb Controls */}
      <div className="max-w-lg w-full mx-auto pb-4 space-y-4">
        <div className="flex items-center justify-center gap-2 p-1 bg-[#131720] rounded-xl w-fit mx-auto border border-white/10">
          <button
            type="button"
            disabled={isRecording}
            onClick={() => setMode('photo')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              mode === 'photo'
                ? 'bg-white text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Photo
          </button>
          <button
            type="button"
            disabled={isRecording}
            onClick={() => setMode('video')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              mode === 'video'
                ? 'bg-[#E11D48] text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            Video Clip
          </button>
        </div>

        <div className="flex items-center justify-center">
          {mode === 'photo' ? (
            <button
              type="button"
              disabled={!!errorMsg}
              onClick={handleTakePhoto}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-95 transition-transform disabled:opacity-40"
              aria-label="Capture Photo"
            >
              <span className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <Check className="w-6 h-6 text-slate-950 opacity-0" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!!errorMsg}
              onClick={handleToggleVideoRecord}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center p-1.5 active:scale-95 transition-transform disabled:opacity-40"
              aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              {isRecording ? (
                <span className="w-7 h-7 rounded-md bg-[#E11D48] flex items-center justify-center">
                  <Square className="w-4 h-4 text-white fill-current" />
                </span>
              ) : (
                <span className="w-full h-full rounded-full bg-[#E11D48] flex items-center justify-center">
                  <Circle className="w-6 h-6 text-white fill-current" />
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
