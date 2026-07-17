import { Capacitor } from "@capacitor/core";

// Na iOS/Android koristi nativnu kameru (Capacitor), na webu/macOS <input> fallback.
export async function capturePhoto(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt, // korisnik bira: kamera ili galerija
      correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  }
  return pickFromFileInput();
}

function pickFromFileInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
