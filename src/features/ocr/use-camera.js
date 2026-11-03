'use client';

import { useEffect, useRef, useState } from 'react';

const CAMERA_NOT_ON_THIS_PAGE =
  'The camera does not work on this page. You can upload a photo or type the details instead.';
const CAMERA_REFUSED =
  'Camera permission was refused. You can upload a photo or type the details instead.';
const NO_CAMERA_FOUND =
  'We could not find a camera on this device. You can upload a photo or type the details instead.';
const CAMERA_FAILED =
  'The camera could not start. You can upload a photo or type the details instead.';

function stopTracks(stream) {
  stream.getTracks().forEach((track) => track.stop());
}

function cameraErrorMessage(error) {
  if (error.name === 'NotAllowedError') return CAMERA_REFUSED;
  if (error.name === 'NotFoundError') return NO_CAMERA_FOUND;
  return CAMERA_FAILED;
}

// FR6 CIR1 Show the back camera in a video while the screen is open
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream = null;
    let closed = false;

    async function startCamera() {
      // The browser only offers the camera on HTTPS or localhost
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(CAMERA_NOT_ON_THIS_PAGE);
        return;
      }
      try {
        // A wish, not a rule, so a device with only a front camera still works
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        // The screen closed while the browser was asking for permission
        if (closed) {
          stopTracks(newStream);
          return;
        }
        stream = newStream;
        streamRef.current = newStream;
        videoRef.current.srcObject = newStream;
      } catch (cameraError) {
        if (!closed) setError(cameraErrorMessage(cameraError));
      }
    }

    startCamera();
    return () => {
      closed = true;
      if (stream) stopTracks(stream);
    };
  }, []);

  // Called on capture and on cancel, so the camera light goes off at once
  function stopCamera() {
    if (streamRef.current) stopTracks(streamRef.current);
    streamRef.current = null;
  }

  return { videoRef, error, stopCamera };
}
