// Capture one webcam frame as an ImageBitmap (transferable to the worker).
export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS (or localhost).');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
  video.srcObject = stream; await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());   // call to release the camera
}
export function grabFrame(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return createImageBitmap(c);
}
